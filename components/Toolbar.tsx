'use client';
import * as React from 'react';
import { Brush, Eraser, Eye, PaintBucket, RotateCcw, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BRUSH_SIZES, COLORS } from '@/lib/constants';
import type { Tool } from '@/lib/types';

type Props = {
  tool: Tool;
  color: string;
  size: number;
  onTool: (t: Tool) => void;
  onColor: (c: string) => void;
  onSize: (s: number) => void;
  onUndo: () => void;
  onClear: () => void;
};

export function Toolbar(props: Props) {
  return (
    <div className="flex w-full flex-wrap items-center gap-2 rounded-lg border-2 border-ink bg-paper p-2 shadow-doodle-sm">
      <div className="flex flex-wrap gap-1.5">
        {COLORS.map((c) => {
          const sel = c === props.color;
          return (
            <button
              key={c}
              type="button"
              aria-label={`Color ${c}`}
              onClick={() => props.onColor(c)}
              className={cn(
                'press-doodle h-6 w-6 rounded-md border-2 border-ink',
                sel && 'ring-2 ring-coral ring-offset-1 ring-offset-paper',
              )}
              style={{ background: c }}
            />
          );
        })}
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        <ToolBtn label="Brush" active={props.tool === 'brush'} onClick={() => props.onTool('brush')}>
          <Brush className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn label="Eraser" active={props.tool === 'eraser'} onClick={() => props.onTool('eraser')}>
          <Eraser className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn label="Fill" active={props.tool === 'fill'} onClick={() => props.onTool('fill')}>
          <PaintBucket className="h-4 w-4" />
        </ToolBtn>
        <span className="mx-1 h-6 w-px bg-ink/30" />
        {BRUSH_SIZES.map((s) => (
          <button
            key={s}
            type="button"
            aria-label={`Size ${s}`}
            onClick={() => props.onSize(s)}
            className={cn(
              'press-doodle flex h-9 w-9 items-center justify-center rounded-md border-2 border-ink bg-paper-dark',
              props.size === s && 'bg-mustard',
            )}
          >
            <span
              className="block rounded-full bg-ink"
              style={{ width: Math.min(20, Math.max(4, s / 2)), height: Math.min(20, Math.max(4, s / 2)) }}
            />
          </button>
        ))}
        <span className="mx-1 h-6 w-px bg-ink/30" />
        <ToolBtn label="Undo" onClick={props.onUndo}>
          <RotateCcw className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn label="Clear" onClick={props.onClear}>
          <Trash2 className="h-4 w-4" />
        </ToolBtn>
      </div>
    </div>
  );
}

function ToolBtn({
  active,
  onClick,
  children,
  label,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'press-doodle flex h-9 w-9 items-center justify-center rounded-md border-2 border-ink bg-paper-dark',
        active && 'bg-coral',
      )}
    >
      {children}
    </button>
  );
}

export function ViewerOverlay({ word }: { word: string | null }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-3">
      <div className="rounded-md border-2 border-ink bg-paper px-3 py-1 text-xs text-ink-soft shadow-doodle-sm">
        <span className="inline-flex items-center gap-1">
          <Eye className="h-3 w-3" /> {word ? 'Drawing in progress' : 'Watching…'}
        </span>
      </div>
    </div>
  );
}
