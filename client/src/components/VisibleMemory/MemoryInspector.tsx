import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useToastContext } from '@librechat/client';
import { Bot, Trash2, TriangleAlert, User, X } from 'lucide-react';
import { useAddBlockMemoryMutation, useDeleteBlockMemoryMutation } from '~/data-provider';
import type { BlockOrb } from './types';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface MemoryInspectorProps {
  orb: BlockOrb | null;
  hue: string;
  onClose: () => void;
}

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });

/**
 * Liest und bearbeitet die an einem Block gespeicherten Einträge.
 *
 * Jede Änderung hier geht als echte Mutation an /api/blocks/:blockId/memory und
 * kommt über den Query-Cache zurück - der Orb wächst und schrumpft also als
 * Folge des tatsächlichen Serverzustands, nicht als lokale Attrappe.
 *
 * Liegt als Overlay über dem Orb-Feld, weil ein seitlich angedocktes Panel in
 * einer 360px breiten Sidebar keinen Platz hat.
 */
export default function MemoryInspector({ orb, hue, onClose }: MemoryInspectorProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [draft, setDraft] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);

  const addMemory = useAddBlockMemoryMutation();
  const deleteMemory = useDeleteBlockMemoryMutation();

  useEffect(() => {
    setDraft('');
  }, [orb?.id]);

  /* Nur beim Öffnen fokussieren. Die Abhängigkeit muss die id sein, nicht das
   * Objekt: `orbs.find(...)` liefert bei jedem Render eine neue Referenz, der
   * Fokus würde sonst bei jedem Render zurück auf den Schließen-Knopf springen
   * und Tastatureingaben im Textfeld verschlucken. */
  const orbId = orb?.id;
  useEffect(() => {
    if (!orbId) {
      return;
    }
    closeRef.current?.focus();
  }, [orbId]);

  useEffect(() => {
    if (!orbId) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [orbId, onClose]);

  const handleAdd = () => {
    if (!orb || !draft.trim() || addMemory.isLoading) {
      return;
    }
    addMemory.mutate(
      { blockId: orb.id, text: draft },
      {
        onSuccess: () => setDraft(''),
        onError: () =>
          showToast({ message: localize('com_ui_vismem_add_failed'), status: 'error' }),
      },
    );
  };

  const handleDelete = (entryId: string) => {
    if (!orb) {
      return;
    }
    deleteMemory.mutate(
      { blockId: orb.id, entryId },
      {
        onError: () =>
          showToast({ message: localize('com_ui_vismem_delete_failed'), status: 'error' }),
      },
    );
  };

  return (
    <AnimatePresence>
      {orb && (
        <motion.div
          key={orb.id}
          role="dialog"
          aria-label={localize('com_ui_vismem_dialog_label', { title: orb.title })}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.16 }}
          className="absolute inset-0 z-20 flex flex-col overflow-hidden rounded-xl bg-surface-primary"
        >
          <header className="flex items-start gap-2 border-b border-border-light p-2.5">
            <span
              aria-hidden="true"
              className="mt-1 size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: hue }}
            />
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-xs font-semibold text-text-primary">{orb.title}</h3>
              <p className="text-[11px] text-text-secondary">
                {localize('com_ui_vismem_orb_meta', {
                  entries: orb.entries.length,
                  tokens: orb.tokenCount,
                })}
              </p>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label={localize('com_ui_vismem_close')}
              className="rounded p-1 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </header>

          {orb.orphaned && (
            <p className="flex items-start gap-1.5 border-b border-border-light bg-surface-secondary px-2.5 py-1.5 text-[11px] text-text-secondary">
              <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
              {localize('com_ui_vismem_orphan_notice')}
            </p>
          )}

          <div className="flex-1 overflow-y-auto p-2">
            <ul className="space-y-1.5">
              <AnimatePresence initial={false}>
                {orb.entries.map((entry) => (
                  <motion.li
                    key={entry.id}
                    layout
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.18 }}
                    className="overflow-hidden"
                  >
                    <div className="group rounded-lg border border-border-light p-2 hover:bg-surface-secondary">
                      <p className="text-[11px] text-text-primary">{entry.text}</p>
                      <div className="mt-1 flex items-center gap-1.5">
                        {entry.source === 'user' ? (
                          <User className="size-3 shrink-0 text-text-tertiary" aria-hidden="true" />
                        ) : (
                          <Bot className="size-3 shrink-0 text-text-tertiary" aria-hidden="true" />
                        )}
                        <span className="text-[10px] text-text-tertiary">
                          {localize('com_ui_vismem_fragment_meta', {
                            tokens: entry.tokenCount,
                            date: formatDate(entry.createdAt),
                          })}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDelete(entry.id)}
                          aria-label={localize('com_ui_vismem_delete_fragment', {
                            text: entry.text.slice(0, 40),
                          })}
                          className={cn(
                            'ml-auto rounded p-0.5 text-text-tertiary opacity-0 transition',
                            'hover:bg-surface-hover hover:text-text-destructive',
                            'focus-visible:opacity-100 group-hover:opacity-100',
                          )}
                        >
                          <Trash2 className="size-3" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
            {orb.entries.length === 0 && (
              <p className="px-1 py-2 text-[11px] text-text-secondary">
                {localize('com_ui_vismem_no_entries')}
              </p>
            )}
          </div>

          <div className="border-t border-border-light p-2">
            <label htmlFor="block-memory-draft" className="sr-only">
              {localize('com_ui_vismem_add_label')}
            </label>
            <textarea
              id="block-memory-draft"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  handleAdd();
                }
              }}
              rows={2}
              placeholder={localize('com_ui_vismem_add_placeholder')}
              className={cn(
                'w-full resize-none rounded-lg border border-border-medium bg-surface-secondary',
                'p-1.5 text-[11px] text-text-primary placeholder:text-text-tertiary',
                'focus:border-border-heavy focus:outline-none',
              )}
            />
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-[10px] text-text-tertiary">
                {localize('com_ui_vismem_add_hint')}
              </span>
              <button
                type="button"
                onClick={handleAdd}
                disabled={!draft.trim() || addMemory.isLoading}
                className={cn(
                  'ml-auto rounded-lg bg-surface-submit px-2.5 py-1 text-[11px] font-medium text-white',
                  'hover:bg-surface-submit-hover disabled:opacity-40',
                )}
              >
                {localize('com_ui_vismem_add')}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
