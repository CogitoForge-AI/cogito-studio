#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WebviewLifecycle {
    Ready,
    Visible,
    Hidden,
}
