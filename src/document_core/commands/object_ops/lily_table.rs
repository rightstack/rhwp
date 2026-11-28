//! [lily] 표 개체 설명문(임베드 호스트 LilyOffice 에이치독스의 표 스타일 기억).
//!
//! HWP 에는 Word 표 스타일 같은 개체가 없어, 호스트는 고른 스타일과 옵션을 칸마다 직접 꾸밈으로 넣고
//! 무엇을 골랐는지는 표의 개체 설명문(CommonObjAttr description — 한컴 "개체 설명문", 차트 그림의 `lily-chart:` 와 같은 길)에 남긴다.
//! 설명문은 hwp(개체 공통 속성 끝) · hwpx(`hp:shapeComment`) 저장에 실린다. 원본 레코드(raw_ctrl_data)를 그대로 쓰면 바꾼 설명문이
//! 빠지므로 바꿀 때 원본을 비워 공통 속성에서 다시 만들게 한다(편집기에서 새로 만든 표와 같은 길). upstream 함수는 고치지 않는다.

use crate::document_core::DocumentCore;
use crate::error::HwpError;
use crate::model::control::Control;

impl DocumentCore {
    /// 표 개체 설명문 — `{"description": string}`
    pub fn lily_table_description_native(
        &self,
        section_idx: usize,
        parent_para_idx: usize,
        control_idx: usize,
    ) -> Result<String, HwpError> {
        let para = self
            .document
            .sections
            .get(section_idx)
            .and_then(|s| s.paragraphs.get(parent_para_idx))
            .ok_or_else(|| HwpError::RenderError("paragraph not found".into()))?;
        match para.controls.get(control_idx) {
            Some(Control::Table(t)) => {
                Ok(serde_json::json!({ "description": t.common.description }).to_string())
            }
            _ => Err(HwpError::RenderError("not a table".into())),
        }
    }

    /// 표 개체 설명문 바꾸기
    pub fn lily_set_table_description_native(
        &mut self,
        section_idx: usize,
        parent_para_idx: usize,
        control_idx: usize,
        text: &str,
    ) -> Result<String, HwpError> {
        let t = self.get_table_mut(section_idx, parent_para_idx, control_idx)?;
        if t.common.description != text {
            t.common.description = text.to_string();
            t.raw_ctrl_data.clear();
            t.raw_ctrl_seal = None;
            self.document.sections[section_idx].raw_stream = None;
        }
        Ok("{\"ok\":true}".to_string())
    }
}
