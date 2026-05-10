'use client';
import * as React from 'react';
import { Brush, Eraser, Eye, Palette, PaintBucket, RotateCcw, Trash2 } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
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
    <div className="flex w-full items-center gap-1.5 rounded-lg border-2 border-ink bg-paper p-1.5 shadow-doodle-sm sm:gap-2 sm:p-2">
      <ColorMenu color={props.color} onColor={props.onColor} />
      <SizeMenu size={props.size} onSize={props.onSize} />
      <span className="mx-0.5 h-7 w-px bg-ink/30" />
      <ToolBtn label="Brush" active={props.tool === 'brush'} onClick={() => props.onTool('brush')}>
        <Brush className="h-4 w-4" />
      </ToolBtn>
      <ToolBtn label="Eraser" active={props.tool === 'eraser'} onClick={() => props.onTool('eraser')}>
        <Eraser className="h-4 w-4" />
      </ToolBtn>
      <ToolBtn label="Fill" active={props.tool === 'fill'} onClick={() => props.onTool('fill')}>
        <PaintBucket className="h-4 w-4" />
      </ToolBtn>
      <span className="mx-0.5 h-7 w-px bg-ink/30" />
      <ToolBtn label="Undo" onClick={props.onUndo}>
        <RotateCcw className="h-4 w-4" />
      </ToolBtn>
      <ToolBtn label="Clear" onClick={props.onClear}>
        <Trash2 className="h-4 w-4" />
      </ToolBtn>
    </div>
  );
}

function ColorMenu({ color, onColor }: { color: string; onColor: (c: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const isLight = isLightColor(color);
  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Pick color"
          title="Pick color"
          className="press-doodle relative flex h-9 w-9 items-center justify-center rounded-md border-2 border-ink"
          style={{ background: color }}
        >
          <Palette
            className={cn('h-4 w-4', isLight ? 'text-ink' : 'text-paper')}
            aria-hidden="true"
          />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-50 grid grid-cols-6 gap-1.5 rounded-lg border-2 border-ink bg-paper p-2 shadow-doodle"
        >
          {COLORS.map((c) => {
            const sel = c === color;
            return (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                onClick={() => {
                  onColor(c);
                  setOpen(false);
                }}
                className={cn(
                  'press-doodle h-7 w-7 rounded-md border-2 border-ink',
                  sel && 'ring-2 ring-coral ring-offset-1 ring-offset-paper',
                )}
                style={{ background: c }}
              />
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function SizeMenu({ size, onSize }: { size: number; onSize: (s: number) => void }) {
  const [open, setOpen] = React.useState(false);
  const dotPx = Math.min(20, Math.max(4, size / 2));
  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Pick brush size"
          title="Pick brush size"
          className="press-doodle flex h-9 w-9 items-center justify-center rounded-md border-2 border-ink bg-paper-dark"
        >
          <span
            className="block rounded-full bg-ink"
            style={{ width: dotPx, height: dotPx }}
          />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-50 flex items-center gap-1.5 rounded-lg border-2 border-ink bg-paper p-2 shadow-doodle"
        >
          {BRUSH_SIZES.map((s) => (
            <button
              key={s}
              type="button"
              aria-label={`Size ${s}`}
              onClick={() => {
                onSize(s);
                setOpen(false);
              }}
              className={cn(
                'press-doodle flex h-9 w-9 items-center justify-center rounded-md border-2 border-ink bg-paper-dark',
                size === s && 'bg-mustard',
              )}
            >
              <span
                className="block rounded-full bg-ink"
                style={{
                  width: Math.min(20, Math.max(4, s / 2)),
                  height: Math.min(20, Math.max(4, s / 2)),
                }}
              />
            </button>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
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

function isLightColor(hex: string): boolean {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  // Perceived luminance
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6;
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
