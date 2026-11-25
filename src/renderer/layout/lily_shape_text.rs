//! [lily] 돌린 도형의 글을 도형과 함께 돌린다.
//!
//! 도형(사각형 · 타원 · 다각형 · 곡선)의 회전은 도형 노드의 `transform` 으로 그리는데, 글상자 글(자식 TextRun)은
//! 페인트 재생 경로에서 그 변환 밖에 그려져 가로로 남았다(한컴은 글도 같이 돌린다). 글 줄마다 TextRun 의
//! 가운데를 도형 가운데 둘레로 돌려 옮기고 TextRun 자체 회전(`rotation` — 세로쓰기 글자 회전과 같은 칸)에
//! 도형 각도를 더한다. 뒤집기가 섞인 도형 · 글상자 안 그림 · 표는 그대로 둔다(LilyOffice docs/research/hdocs-shapes.md).

use crate::renderer::render_tree::{RenderNode, RenderNodeType, ShapeTransform};

/// `shape_node` 의 자손 TextRun 을 도형 가운데 둘레로 `transform.rotation` 만큼 돌린다
pub(crate) fn rotate_shape_text(shape_node: &mut RenderNode, transform: &ShapeTransform) {
    if transform.rotation == 0.0 || transform.horz_flip || transform.vert_flip {
        return;
    }
    let b = shape_node.bbox;
    let (cx, cy) = (b.x + b.width / 2.0, b.y + b.height / 2.0);
    let (sin, cos) = transform.rotation.to_radians().sin_cos();
    for child in shape_node.children.iter_mut() {
        rotate_runs(child, cx, cy, sin, cos, transform.rotation);
    }
}

fn rotate_runs(node: &mut RenderNode, cx: f64, cy: f64, sin: f64, cos: f64, deg: f64) {
    if let RenderNodeType::TextRun(run) = &mut node.node_type {
        let b = node.bbox;
        let (mx, my) = (b.x + b.width / 2.0 - cx, b.y + b.height / 2.0 - cy);
        let (nx, ny) = (cx + mx * cos - my * sin, cy + mx * sin + my * cos);
        node.bbox.x = nx - b.width / 2.0;
        node.bbox.y = ny - b.height / 2.0;
        run.rotation += deg;
        return;
    }
    if matches!(
        node.node_type,
        RenderNodeType::Image(_) | RenderNodeType::Table(_)
    ) {
        return;
    }
    for child in node.children.iter_mut() {
        rotate_runs(child, cx, cy, sin, cos, deg);
    }
}

/// 위의 거꾸로: 돌린 도형 노드를 0° 로 되돌린다(도형 하나만 그린 그림 — 호스트가 끄는 동안 보이는 자기 그림, LilyOffice `shape.image`)
pub(crate) fn unrotate_shape(shape_node: &mut RenderNode) {
    let t = match &mut shape_node.node_type {
        RenderNodeType::Rectangle(r) => &mut r.transform,
        RenderNodeType::Ellipse(e) => &mut e.transform,
        RenderNodeType::Path(p) => &mut p.transform,
        RenderNodeType::Line(l) => &mut l.transform,
        _ => return,
    };
    let deg = t.rotation;
    if deg == 0.0 {
        return;
    }
    let flipped = t.horz_flip || t.vert_flip;
    t.rotation = 0.0;
    if !flipped {
        rotate_shape_text(
            shape_node,
            &ShapeTransform {
                rotation: -deg,
                horz_flip: false,
                vert_flip: false,
            },
        );
    }
}
