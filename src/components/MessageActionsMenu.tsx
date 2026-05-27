import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Download, Edit3, MoreVertical, Trash2 } from 'lucide-react';

type Props = {
  canCopy?: boolean;
  canDelete: boolean;
  canDownload: boolean;
  canEdit: boolean;
  copyLabel?: string;
  copyValue: string;
  downloadFilename?: string;
  downloadUrl?: string;
  mine: boolean;
  onClose: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onFeedback: (message: string) => void;
  onToggle: () => void;
  open: boolean;
};

function downloadFile(url: string, filename: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export default function MessageActionsMenu({
  canCopy = true,
  canDelete,
  canDownload,
  canEdit,
  copyLabel = 'Copiar',
  copyValue,
  downloadFilename = 'raddo-imagem.jpg',
  downloadUrl,
  mine,
  onClose,
  onDelete,
  onEdit,
  onFeedback,
  onToggle,
  open,
}: Props) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0 });
  const buttonColor = mine ? 'bg-transparent text-slate-700 hover:bg-slate-950/10' : 'bg-transparent text-slate-300 hover:bg-white/8';

  useEffect(() => {
    if (!open || !buttonRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const menuWidth = 160;
    const menuHeight = 184;
    const gap = 6;
    setMenuPosition({
      left: Math.max(8, Math.min(window.innerWidth - menuWidth - 8, rect.right - menuWidth)),
      top: Math.max(8, Math.min(window.innerHeight - menuHeight - 8, rect.bottom + gap)),
    });
  }, [open]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(copyValue);
      onFeedback(copyLabel === 'Copiar link' ? 'Link copiado.' : 'Mensagem copiada.');
    } catch {
      onFeedback('Não consegui copiar.');
    } finally {
      onClose();
    }
  }

  function handleDownload() {
    if (!downloadUrl) return;
    downloadFile(downloadUrl, downloadFilename);
    onFeedback('Download iniciado.');
    onClose();
  }

  return (
    <div className="absolute right-1 top-1 z-20">
      <button
        aria-label="Opções da mensagem"
        className={`grid h-6 w-6 place-items-center rounded-full ${buttonColor}`}
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        ref={buttonRef}
        type="button"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && createPortal(
        <div
          className="fixed z-[5000] w-40 overflow-hidden rounded-lg border border-white/10 bg-[#07111f] py-1 text-sm text-slate-100 shadow-2xl"
          onClick={(event) => event.stopPropagation()}
          style={{ left: `${menuPosition.left}px`, top: `${menuPosition.top}px` }}
        >
          {canCopy && (
            <button className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-white/8" onClick={handleCopy} type="button">
              <Copy className="h-4 w-4" />
              {copyLabel}
            </button>
          )}
          {canDownload && (
            <button className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-white/8" onClick={handleDownload} type="button">
              <Download className="h-4 w-4" />
              Baixar
            </button>
          )}
          {canEdit && (
            <button className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-white/8" onClick={onEdit} type="button">
              <Edit3 className="h-4 w-4" />
              Editar
            </button>
          )}
          {canDelete && (
            <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-rose-100 hover:bg-rose-400/15" onClick={onDelete} type="button">
              <Trash2 className="h-4 w-4" />
              Excluir
            </button>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
