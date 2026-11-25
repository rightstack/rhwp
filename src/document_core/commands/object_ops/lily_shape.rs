//! [lily] 임베드 호스트 도형 패널용 그리기 개체 꾸밈 읽기·쓰기와 도형 글 만들기.
//!
//! LilyOffice 에이치독스는 도형을 호스트 UI([도형] 속성 패널 · 선택 틀)로 고친다. 엔진의 `setShapeProperties` 는
//! 개체 하나의 꾸밈만 바꾸고 묶음(GroupShape)에는 꾸밈이 없으며, 그림자 투명도 · 도형 글(사각형 · 타원 · 다각형에
//! 글자 넣기)을 만드는 길이 없다. 이 모듈은 upstream 함수를 고치지 않고 따로 둔다:
//! - `lily_shape_style_native`  : 채우기 · 선 · 그림자를 개체에, 묶음이면 안의 개체 모두에(닫힌 꼴에만 채우기)
//! - `lily_shape_style_get_native` : 위 꾸밈 + 종류 · 닫힘 · 글 있음 (묶음이면 첫 닫힌 자식의 꾸밈)
//! - `lily_ensure_shape_text_native` : 사각형 · 타원 · 다각형 · 곡선에 빈 글 영역(세로 가운데 · 가운데 맞춤)을 만든다

use crate::document_core::helpers::{json_bool, json_i32};
use crate::document_core::DocumentCore;
use crate::error::HwpError;
use crate::model::control::Control;
use crate::model::shape::{DrawingObjAttr, ShapeObject, TextBox};

/// 꼴이 닫혀 있는가(채우기를 받는가): 다각형 · 곡선은 첫 점 = 끝 점일 때만
fn is_closed(shape: &ShapeObject) -> bool {
    match shape {
        ShapeObject::Line(_) | ShapeObject::Arc(_) => false,
        ShapeObject::Polygon(p) => match (p.points.first(), p.points.last()) {
            (Some(a), Some(b)) => p.points.len() > 2 && a.x == b.x && a.y == b.y,
            _ => false,
        },
        ShapeObject::Curve(c) => match (c.points.first(), c.points.last()) {
            (Some(a), Some(b)) => c.points.len() > 2 && a.x == b.x && a.y == b.y,
            _ => false,
        },
        _ => true,
    }
}

fn kind_name(shape: &ShapeObject) -> &'static str {
    match shape {
        ShapeObject::Line(l) if l.connector.is_some() => "connector",
        ShapeObject::Line(_) => "line",
        ShapeObject::Rectangle(r)
            if r.drawing.text_box.is_some() && r.common.description.starts_with("글상자") =>
        {
            "textbox"
        }
        ShapeObject::Rectangle(_) => "rectangle",
        ShapeObject::Ellipse(_) => "ellipse",
        ShapeObject::Arc(_) => "arc",
        ShapeObject::Polygon(_) => "polygon",
        ShapeObject::Curve(_) => "curve",
        ShapeObject::Group(_) => "group",
        ShapeObject::Picture(_) => "picture",
        ShapeObject::Chart(_) => "chart",
        ShapeObject::Ole(_) => "ole",
    }
}

/// 꾸밈 키를 그리기 속성 하나에. `closed` 가 아니면 채우기는 건드리지 않는다
fn apply_style(d: &mut DrawingObjAttr, closed: bool, props: &str) {
    use crate::model::style::{FillType, SolidFill};
    if closed {
        if let Some(v) = json_bool(props, "fillNone") {
            if v {
                d.fill.fill_type = FillType::None;
            }
        }
        if let Some(v) = json_i32(props, "fillColor") {
            d.fill.fill_type = FillType::Solid;
            d.fill.gradient = None;
            let s = d.fill.solid.get_or_insert_with(|| SolidFill {
                pattern_type: -1,
                ..Default::default()
            });
            s.background_color = v as u32;
            s.pattern_type = -1;
        }
        if let Some(v) = json_i32(props, "fillAlpha") {
            d.fill.alpha = v.clamp(0, 255) as u8;
        }
    }
    if let Some(v) = json_i32(props, "borderColor") {
        d.border_line.color = v as u32;
    }
    if let Some(v) = json_i32(props, "borderWidth") {
        d.border_line.width = v;
    }
    if let Some(v) = json_i32(props, "lineType") {
        d.border_line.attr = (d.border_line.attr & !0x3F) | ((v as u32) & 0x3F);
    }
    if let Some(v) = json_i32(props, "shadowType") {
        d.shadow_type = v.max(0) as u32;
    }
    if let Some(v) = json_i32(props, "shadowColor") {
        d.shadow_color = v as u32;
    }
    if let Some(v) = json_i32(props, "shadowOffsetX") {
        d.shadow_offset_x = v;
    }
    if let Some(v) = json_i32(props, "shadowOffsetY") {
        d.shadow_offset_y = v;
    }
    if let Some(v) = json_i32(props, "shadowAlpha") {
        d.shadow_alpha = v.clamp(0, 255) as u8;
    }
}

fn apply_style_deep(shape: &mut ShapeObject, props: &str) {
    if let ShapeObject::Group(g) = shape {
        for child in g.children.iter_mut() {
            apply_style_deep(child, props);
        }
        return;
    }
    let closed = is_closed(shape);
    if let Some(d) = shape.drawing_mut() {
        apply_style(d, closed, props);
    }
}

/// 꾸밈을 읽을 개체: 묶음이면 첫 닫힌 자식(없으면 첫 자식)
fn style_source(shape: &ShapeObject) -> &ShapeObject {
    if let ShapeObject::Group(g) = shape {
        let mut first: Option<&ShapeObject> = None;
        for child in &g.children {
            let leaf = style_source(child);
            if first.is_none() {
                first = Some(leaf);
            }
            if is_closed(leaf) && leaf.drawing().is_some() {
                return leaf;
            }
        }
        return first.unwrap_or(shape);
    }
    shape
}

impl DocumentCore {
    fn lily_body_shape(
        &self,
        sec: usize,
        para: usize,
        ci: usize,
    ) -> Result<&ShapeObject, HwpError> {
        match self
            .document
            .sections
            .get(sec)
            .and_then(|s| s.paragraphs.get(para))
            .and_then(|p| p.controls.get(ci))
        {
            Some(Control::Shape(s)) => Ok(s.as_ref()),
            _ => Err(HwpError::RenderError(
                "지정된 컨트롤이 본문 Shape이 아닙니다".to_string(),
            )),
        }
    }

    fn lily_body_shape_mut(
        &mut self,
        sec: usize,
        para: usize,
        ci: usize,
    ) -> Result<&mut ShapeObject, HwpError> {
        match self
            .document
            .sections
            .get_mut(sec)
            .and_then(|s| s.paragraphs.get_mut(para))
            .and_then(|p| p.controls.get_mut(ci))
        {
            Some(Control::Shape(s)) => Ok(s.as_mut()),
            _ => Err(HwpError::RenderError(
                "지정된 컨트롤이 본문 Shape이 아닙니다".to_string(),
            )),
        }
    }

    fn lily_after_shape_change(&mut self, sec: usize) {
        self.document.sections[sec].raw_stream = None;
        self.recompose_section(sec);
        self.paginate_if_needed();
        self.invalidate_page_tree_cache();
    }

    /// 채우기(fillNone · fillColor · fillAlpha 0=불투명 255=투명) · 선(borderColor · borderWidth · lineType) ·
    /// 그림자(shadowType · shadowColor · shadowOffsetX/Y · shadowAlpha)를 바꾼다. 묶음이면 안의 개체 모두에.
    pub fn lily_shape_style_native(
        &mut self,
        sec: usize,
        para: usize,
        ci: usize,
        props: &str,
    ) -> Result<String, HwpError> {
        let shape = self.lily_body_shape_mut(sec, para, ci)?;
        apply_style_deep(shape, props);
        self.lily_after_shape_change(sec);
        Ok("{\"ok\":true}".to_string())
    }

    /// 종류 · 닫힘 · 글 있음 · 꾸밈(묶음이면 첫 닫힌 자식의 꾸밈)
    pub fn lily_shape_style_get_native(
        &self,
        sec: usize,
        para: usize,
        ci: usize,
    ) -> Result<String, HwpError> {
        let shape = self.lily_body_shape(sec, para, ci)?;
        let src = style_source(shape);
        let closed = is_closed(src);
        let has_text = crate::document_core::helpers::get_textbox_from_shape(shape).is_some();
        let can_text = matches!(
            shape,
            ShapeObject::Rectangle(_) | ShapeObject::Ellipse(_) | ShapeObject::Curve(_)
        ) || (matches!(shape, ShapeObject::Polygon(_)) && is_closed(shape));
        let mut out = format!(
            "{{\"ok\":true,\"kind\":\"{}\",\"closed\":{},\"hasText\":{},\"canText\":{}",
            kind_name(shape),
            closed,
            has_text,
            can_text
        );
        if let Some(d) = src.drawing() {
            let solid = matches!(
                d.fill.fill_type,
                crate::model::style::FillType::Solid | crate::model::style::FillType::Gradient
            );
            let fill_color = d
                .fill
                .solid
                .as_ref()
                .map(|s| s.background_color)
                .unwrap_or(0x00FF_FFFF);
            out.push_str(&format!(
                ",\"fill\":{},\"fillColor\":{},\"fillAlpha\":{},\"borderColor\":{},\"borderWidth\":{},\"lineType\":{},\"shadowType\":{},\"shadowColor\":{},\"shadowOffsetX\":{},\"shadowOffsetY\":{},\"shadowAlpha\":{}",
                closed && solid,
                fill_color,
                d.fill.alpha,
                d.border_line.color,
                d.border_line.width,
                d.border_line.attr & 0x3F,
                d.shadow_type,
                d.shadow_color,
                d.shadow_offset_x,
                d.shadow_offset_y,
                d.shadow_alpha
            ));
        }
        if let ShapeObject::Rectangle(r) = shape {
            out.push_str(&format!(",\"roundRate\":{}", r.round_rate));
        }
        out.push('}');
        Ok(out)
    }

    /// 사각형 · 타원 · 닫힌 다각형 · 곡선에 빈 글 영역(세로 가운데, 여백 1mm)을 만든다. 이미 있으면 그대로.
    /// 반환 `{"ok":true,"created":bool}`. 선 · 호 · 열린 꼴 · 묶음은 글을 담지 않는다(ok false).
    pub fn lily_ensure_shape_text_native(
        &mut self,
        sec: usize,
        para: usize,
        ci: usize,
    ) -> Result<String, HwpError> {
        use crate::model::paragraph::{CharShapeRef, LineSeg, Paragraph};
        let (char_shape_id, para_shape_id) = {
            let p = self
                .document
                .sections
                .get(sec)
                .and_then(|s| s.paragraphs.get(para))
                .ok_or_else(|| HwpError::RenderError("문단 범위 초과".to_string()))?;
            (p.char_shape_id_at(0).unwrap_or(0), p.para_shape_id)
        };
        let shape = self.lily_body_shape_mut(sec, para, ci)?;
        let can = matches!(
            shape,
            ShapeObject::Rectangle(_) | ShapeObject::Ellipse(_) | ShapeObject::Curve(_)
        ) || (matches!(shape, ShapeObject::Polygon(_)) && is_closed(shape));
        if !can {
            return Ok("{\"ok\":false,\"created\":false}".to_string());
        }
        let width = shape.common().width;
        let d = shape
            .drawing_mut()
            .ok_or_else(|| HwpError::RenderError("그리기 속성이 없습니다".to_string()))?;
        if d.text_box.is_some() {
            return Ok("{\"ok\":true,\"created\":false}".to_string());
        }
        let inner_width = width.saturating_sub(566);
        let mut raw_header_extra = vec![0u8; 10];
        raw_header_extra[0..2].copy_from_slice(&1u16.to_le_bytes());
        raw_header_extra[4..6].copy_from_slice(&1u16.to_le_bytes());
        let inner = Paragraph {
            text: String::new(),
            char_count: 1,
            char_count_msb: true,
            control_mask: 0,
            para_shape_id,
            style_id: 0,
            char_shapes: vec![CharShapeRef {
                start_pos: 0,
                char_shape_id,
            }],
            line_segs: vec![LineSeg {
                text_start: 0,
                line_height: 1000,
                text_height: 1000,
                baseline_distance: 850,
                line_spacing: 600,
                segment_width: inner_width as i32,
                tag: LineSeg::TAG_SINGLE_SEGMENT_LINE,
                ..Default::default()
            }],
            has_para_text: false,
            raw_header_extra,
            ..Default::default()
        };
        d.text_box = Some(TextBox {
            // bit 5-6 = 세로 정렬(1 = 가운데)
            list_attr: 0x20,
            vertical_all: false,
            vertical_align: crate::model::table::VerticalAlign::Center,
            margin_left: 283,
            margin_right: 283,
            margin_top: 283,
            margin_bottom: 283,
            max_width: width,
            raw_list_header_extra: vec![0u8; 13],
            paragraphs: vec![inner],
        });
        // 도형 글 = 가운데 맞춤(PowerPoint · Word 도형 글과 같다) — 같은 실행 취소 단계 안
        let _ =
            self.apply_para_format_in_cell_native(sec, para, ci, 0, 0, r#"{"alignment":"center"}"#);
        self.lily_after_shape_change(sec);
        Ok("{\"ok\":true,\"created\":true}".to_string())
    }
}

// 시험: LilyOffice crates/lilyoffice-wasm/src/rhwp_ext.rs `shape_style_and_text_survive_save`(HWP · HWPX 저장 왕복).
