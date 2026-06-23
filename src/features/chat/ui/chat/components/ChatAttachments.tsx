import { memo } from 'react';
import { AttachedFileItem } from '../AttachedFileItem';
import { SkillChip } from '../SkillChip';
import { FlowData } from '@/features/chat/types';
import type { InsertedSkill } from '../../../lib/skillAttachment';
import { LazyFlowAttachment } from '../LazyFlowAttachment';

interface ChatAttachmentsProps {
  attachedFiles: File[];
  attachedFlow: FlowData | null;
  insertedSkill: InsertedSkill | null;
  onRemoveFile: (index: number) => void;
  onRemoveFlow: () => void;
  onOpenFlowDialog: () => void;
  onRemoveSkill: () => void;
  disabled?: boolean;
}

export const ChatAttachments = memo(function ChatAttachments({
  attachedFiles,
  attachedFlow,
  insertedSkill,
  onRemoveFile,
  onRemoveFlow,
  onOpenFlowDialog,
  onRemoveSkill,
  disabled,
}: ChatAttachmentsProps) {
  return (
    <>
      {attachedFiles.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachedFiles.map((file, index) => (
            <AttachedFileItem
              key={`${file.name}-${file.lastModified}-${file.size}`}
              file={file}
              index={index}
              onRemove={onRemoveFile}
              disabled={disabled ?? false}
            />
          ))}
        </div>
      )}

      {attachedFlow && (
        <div className="flex gap-2 p-2 pt-0">
          <LazyFlowAttachment
            flow={attachedFlow}
            onClick={onOpenFlowDialog}
            onRemove={onRemoveFlow}
            mode="chatinput"
          />
        </div>
      )}

      {insertedSkill && (
        <div className="mb-2">
          <SkillChip
            name={insertedSkill.skillName}
            description={insertedSkill.description}
            onRemove={onRemoveSkill}
            disabled={disabled}
            mode="input"
          />
        </div>
      )}
    </>
  );
});
