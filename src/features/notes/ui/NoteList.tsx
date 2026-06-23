import { useDispatch, useSelector } from 'react-redux';
import { Plus, Search as SearchIcon } from 'lucide-react';
import { AppDispatch, RootState } from '@/app/store';
import { setActiveNote, setSearchQuery } from '../state/notesSlice';
import { createNote, deleteNote, loadNotes } from '../state/notesActions';
import { NoteItem } from './NoteItem';
import { Input } from '@/ui/atoms/input';
import { ScrollArea } from '@/ui/atoms/scroll-area';
import { useEffect } from 'react';

export function NoteList() {
  const dispatch = useDispatch<AppDispatch>();
  const { notes, activeNoteId, searchQuery, isLoading } = useSelector(
    (state: RootState) => state.notes
  );

  useEffect(() => {
    dispatch(loadNotes());
  }, [dispatch]);

  const filteredNotes = notes.filter(
    (note) =>
      note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => dispatch(setSearchQuery(e.target.value))}
            className="h-8 border-none bg-sidebar-accent/55 pl-9 text-xs ring-0 focus-visible:ring-1 focus-visible:ring-primary/20"
          />
        </div>
        <button
          onClick={() => {
            const initialTitle =
              filteredNotes.length === 0 ? searchQuery : undefined;
            dispatch(createNote(initialTitle));
            if (filteredNotes.length === 0) {
              dispatch(setSearchQuery(''));
            }
          }}
          className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary shadow-sm transition-[background-color,color,transform] hover:bg-primary hover:text-primary-foreground active:scale-95"
        >
          <Plus className="size-4" />
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1.5 pb-3">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-10 opacity-50">
              <span className="text-xs">Loading notes...</span>
            </div>
          ) : filteredNotes.length > 0 ? (
            filteredNotes.map((note) => (
              <NoteItem
                key={note.id}
                note={note}
                isActive={activeNoteId === note.id}
                onClick={() => dispatch(setActiveNote(note.id))}
                onDelete={(e) => {
                  e.stopPropagation();
                  dispatch(deleteNote(note.id));
                }}
              />
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center opacity-50">
              <SearchIcon className="mb-2 size-8 text-muted-foreground" />
              <p className="text-xs">No notes found</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
