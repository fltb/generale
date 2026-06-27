/**
 * UI primitives 桶文件。
 *
 * 业务组件统一从 `~/ui` 导入视觉组件，使所有视觉类名收口到 src/ui。
 * 将来切像素风时只需重写 src/ui/* 内部实现 + theme.ts，业务组件无需改动。
 */

export { Alert, type AlertProps, type AlertVariant } from "./Alert";
export { Badge, type BadgeProps, type BadgeVariant } from "./Badge";
export { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from "./Button";
export { Card, type CardProps } from "./Card";
export { Checkbox, type CheckboxProps } from "./Checkbox";
export { Collapse, CollapseContent, type CollapseProps, CollapseTitle } from "./Collapse";
export { Confetti, type ConfettiProps } from "./Confetti";
export { Countdown, type CountdownProps } from "./Countdown";
export { alertDialog, confirmDialog } from "./dialogs";
export { Input, type InputProps } from "./Input";
export { Label, type LabelProps, LabelText, LabelTextAlt } from "./Label";
export { Modal, type ModalProps } from "./Modal";
export { MuteToggle } from "./MuteToggle";
export { Overlay, type OverlayProps, TakeoverOverlay, type TakeoverOverlayProps } from "./Overlay";
export { Panel, type PanelProps, type PanelTone } from "./Panel";
export { Range, type RangeProps } from "./Range";
export { Select, type SelectProps } from "./Select";
export { Spinner, type SpinnerProps } from "./Spinner";
export { isMuted, setMuted, sfx, toggleMuted } from "./sound";
export { Tab, type TabProps, Tabs, type TabsProps } from "./Tabs";
export { Textarea, type TextareaProps } from "./Textarea";
export { type UiTheme, uiTheme } from "./theme";
