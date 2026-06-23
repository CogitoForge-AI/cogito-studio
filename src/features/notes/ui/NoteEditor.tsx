import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { ChevronLeft } from 'lucide-react';
import { AppDispatch, RootState } from '@/app/store';
import { setActiveNote } from '../state/notesSlice';
import { updateNote } from '../state/notesActions';
import { Input } from '@/ui/atoms/input';
import { Textarea } from '@/ui/atoms/textarea';

export function NoteEditor() {
  const dispatch = useDispatch<AppDispatch>();
  const activeNoteId = useSelector(
    (state: RootState) => state.notes.activeNoteId
  );
  const note = useSelector((state: RootState) =>
    state.notes.notes.find((n) => n.id === activeNoteId)
  );

  const [title, setTitle] = useState(note?.title ?? '');
  const [content, setContent] = useState(note?.content ?? '');

  if (!note) return null;

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    dispatch(updateNote(note.id, newTitle, content));
  };

  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    dispatch(updateNote(note.id, title, newContent));
  };

  return (
    <div className="animate-in slide-in-from-right flex flex-col duration-300 h-full">
      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={() => dispatch(setActiveNote(null))}
          className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Back to list
        </button>
        <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium text-muted-foreground/50">
          <span className="size-1.5 rounded-full bg-success/50" />
          Autosaved
        </div>
      </div>
      <Input
        value={title}
        onChange={(e) => handleTitleChange(e.target.value)}
        placeholder="Title"
        className="mb-3 border-none bg-transparent p-0 text-lg font-bold shadow-none ring-0 placeholder:text-muted-foreground/30 focus-visible:ring-0"
      />
      <Textarea
        value={content}
        onChange={(e) => handleContentChange(e.target.value)}
        placeholder="Start writing..."
        className="bg-transparent p-0 shadow-none ring-0 placeholder:text-muted-foreground/30 focus-visible:ring-0 flex-1"
      />
    </div>
  );
}
