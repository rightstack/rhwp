//! [lily] 문서 테마(임베드 호스트 LilyOffice 에이치독스의 색 메뉴 테마 고르기).
//!
//! HWP 에는 OOXML 같은 테마가 없다. 호스트는 테마 이름을 본문 첫 문단의 책갈피 `_lily_theme_<name>` 으로 문서에 남기고
//! (책갈피는 hwp · hwpx 저장 왕복에서 남는다 — 코드 블록 `_lily_code_…` 와 같은 길, 한컴오피스는 책갈피 목록에 보일 뿐 무시한다),
//! 테마를 바꿀 때 문서에 박힌 색 가운데 옛 테마 칸과 같은 것을 새 테마 칸으로 옮긴다(호스트가 표를 만든다):
//! - 글자 모양(CharShape) 표의 글자 색 · 밑줄 색 · 음영 색 — 표 하나를 고치면 그 모양을 쓰는 글자가 모두 바뀐다
//! - 본문 그리기 개체(묶음 안 포함)의 채우기 · 선 색
//! upstream 함수는 고치지 않는다.

use crate::document_core::DocumentCore;
use crate::error::HwpError;
use crate::model::control::Control;
use crate::model::shape::ShapeObject;
use std::collections::HashMap;

pub const THEME_BOOKMARK_PREFIX: &str = "_lily_theme_";

/// "RRGGBB" → HWP ColorRef(0x00BBGGRR)
fn colorref(hex: &str) -> Option<u32> {
    let h = hex.trim_start_matches('#');
    if h.len() != 6 {
        return None;
    }
    let v = u32::from_str_radix(h, 16).ok()?;
    let (r, g, b) = ((v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF);
    Some((b << 16) | (g << 8) | r)
}

/// 이름 → 책갈피에 쓸 수 있는 글자만(영문 · 숫자 · _ · -), 64자까지
fn clean_name(name: &str) -> String {
    name.chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-')
        .take(64)
        .collect()
}

fn remap_shape(shape: &mut ShapeObject, map: &HashMap<u32, u32>, n: &mut usize) {
    if let ShapeObject::Group(g) = shape {
        for child in g.children.iter_mut() {
            remap_shape(child, map, n);
        }
        return;
    }
    if let Some(d) = shape.drawing_mut() {
        if let Some(s) = d.fill.solid.as_mut() {
            if let Some(to) = map.get(&s.background_color) {
                s.background_color = *to;
                *n += 1;
            }
        }
        if let Some(to) = map.get(&d.border_line.color) {
            d.border_line.color = *to;
            *n += 1;
        }
    }
}

impl DocumentCore {
    /// 본문 문단의 테마 책갈피들 (구역, 문단, 컨트롤 번호, 이름)
    fn lily_theme_marks(&self) -> Vec<(usize, usize, usize, String)> {
        let mut out = Vec::new();
        for (si, s) in self.document.sections.iter().enumerate() {
            for (pi, p) in s.paragraphs.iter().enumerate() {
                for (ci, c) in p.controls.iter().enumerate() {
                    if let Control::Bookmark(b) = c {
                        if let Some(rest) = b.name.strip_prefix(THEME_BOOKMARK_PREFIX) {
                            out.push((si, pi, ci, rest.to_string()));
                        }
                    }
                }
            }
        }
        out
    }

    /// 문서 테마 이름: `{"name": "Office"}` · 없으면 `{"name": null}`
    pub fn lily_theme_get_native(&self) -> String {
        match self.lily_theme_marks().into_iter().next() {
            Some((.., name)) => format!(
                "{{\"name\":{}}}",
                serde_json::to_string(&name).unwrap_or_else(|_| "null".into())
            ),
            None => "{\"name\":null}".to_string(),
        }
    }

    /// 문서 테마를 바꾼다: 테마 책갈피를 새 이름 하나로, `map_json` = {"RRGGBB": "RRGGBB"}(옛 테마 칸 → 새 테마 칸)으로 박힌 색을 옮긴다.
    /// 결과 `{"ok": true, "remapped": n}`. 호스트는 snapshot 연산 하나로 부른다(실행 취소 한 단계).
    pub fn lily_theme_set_native(
        &mut self,
        name: &str,
        map_json: &str,
    ) -> Result<String, HwpError> {
        let name = clean_name(name);
        if name.is_empty() {
            return Ok(r#"{"ok":false,"error":"empty theme name"}"#.to_string());
        }
        let raw: HashMap<String, String> = serde_json::from_str(map_json).unwrap_or_default();
        let map: HashMap<u32, u32> = raw
            .iter()
            .filter_map(|(a, b)| Some((colorref(a)?, colorref(b)?)))
            .collect();
        // 1) 책갈피: 있으면 첫 것의 이름만 바꾸고(컨트롤 번호가 그대로 — 호스트가 쥔 도형 참조가 어긋나지 않는다) 나머지는 뒤에서부터 지운다.
        //    없으면 첫 문단 끝에 새로(맨 앞이면 그 문단의 뒤 컨트롤 번호가 밀린다)
        let new_name = format!("{THEME_BOOKMARK_PREFIX}{name}");
        let mut marks = self.lily_theme_marks();
        if let Some((si, pi, ci, _)) = marks.first().cloned() {
            let mut rest: Vec<_> = marks.drain(1..).collect();
            rest.sort_by(|a, b| (b.0, b.1, b.2).cmp(&(a.0, a.1, a.2)));
            for (rs, rp, rc, _) in rest {
                self.delete_bookmark_native(rs, rp, rc)?;
            }
            self.rename_bookmark_native(si, pi, ci, &new_name)?;
        } else if !self.document.sections.is_empty()
            && !self.document.sections[0].paragraphs.is_empty()
        {
            let end = self.get_paragraph_length_native(0, 0).unwrap_or(0);
            self.add_bookmark_native(0, 0, end, &new_name)?;
        }
        // 2) 색 옮기기
        let mut n = 0usize;
        if !map.is_empty() {
            let mut styles_changed = false;
            for cs in self.document.doc_info.char_shapes.iter_mut() {
                let mut hit = false;
                for c in [
                    &mut cs.text_color,
                    &mut cs.underline_color,
                    &mut cs.shade_color,
                ] {
                    if let Some(to) = map.get(c) {
                        *c = *to;
                        hit = true;
                        n += 1;
                    }
                }
                if hit {
                    // 원본 레코드 바이트가 있으면 저장이 그것을 쓰므로 비운다(새 값으로 다시 만든다)
                    cs.raw_data = None;
                    styles_changed = true;
                }
            }
            if styles_changed {
                self.document.doc_info.raw_stream_dirty = true;
                self.rebuild_resolved_styles();
            }
            let count = self.document.sections.len();
            for si in 0..count {
                let mut sec_hit = 0usize;
                for p in self.document.sections[si].paragraphs.iter_mut() {
                    for c in p.controls.iter_mut() {
                        if let Control::Shape(s) = c {
                            remap_shape(s.as_mut(), &map, &mut sec_hit);
                        }
                    }
                }
                if sec_hit > 0 || styles_changed {
                    self.document.sections[si].raw_stream = None;
                    self.recompose_section(si);
                }
                n += sec_hit;
            }
            self.paginate_if_needed();
            self.invalidate_page_tree_cache();
        }
        Ok(format!("{{\"ok\":true,\"remapped\":{n}}}"))
    }
}
