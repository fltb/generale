/**
 * UI primitives 桶文件。
 *
 * 业务组件统一从 `~/ui` 导入视觉组件，使所有视觉类名收口到 src/ui。
 * 将来切像素风时只需重写 src/ui/* 内部实现 + theme.ts，业务组件无需改动。
 */
export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from "./Button";
export { Card, type CardProps } from "./Card";
export { Panel, type PanelProps, type PanelTone } from "./Panel";
export { Badge, type BadgeProps, type BadgeVariant } from "./Badge";
export { Alert, type AlertProps, type AlertVariant } from "./Alert";
export { Spinner, type SpinnerProps } from "./Spinner";
export { Input, type InputProps } from "./Input";
export { Select, type SelectProps } from "./Select";
export { Textarea, type TextareaProps } from "./Textarea";
export { Range, type RangeProps } from "./Range";
export { Modal, type ModalProps } from "./Modal";
export { Overlay, TakeoverOverlay, type OverlayProps, type TakeoverOverlayProps } from "./Overlay";
export { confirmDialog, alertDialog } from "./dialogs";
export { uiTheme, type UiTheme } from "./theme";
export { sfx, isMuted, setMuted, toggleMuted } from "./sound";
export { Confetti, type ConfettiProps } from "./Confetti";
export { Countdown, type CountdownProps } from "./Countdown";
export { MuteToggle } from "./MuteToggle";
export { Collapse, CollapseTitle, CollapseContent, type CollapseProps } from "./Collapse";
export { Tabs, Tab, type TabsProps, type TabProps } from "./Tabs";
export { Checkbox, type CheckboxProps } from "./Checkbox";
export { Label, LabelText, LabelTextAlt, type LabelProps } from "./Label";
