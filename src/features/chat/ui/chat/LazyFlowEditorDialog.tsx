import { Suspense, lazy } from 'react';
import type { FlowData } from '@/features/chat/types';
import type { FlowNodeType } from '@/ui/molecules/flow/FlowEditor';

interface LazyFlowEditorDialogProps {
  open: boolean;
  initialFlow?: FlowData;
  availableNodes?: FlowNodeType[];
  onClose: () => void;
  onSave?: (flow: FlowData) => void;
  readOnly?: boolean;
}

const FlowEditorDialog = lazy(() =>
  import('@/ui/molecules/flow/FlowEditorDialog').then((mod) => ({
    default: mod.FlowEditorDialog,
  }))
);

export function LazyFlowEditorDialog(props: LazyFlowEditorDialogProps) {
  if (!props.open) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <FlowEditorDialog {...props} />
    </Suspense>
  );
}
