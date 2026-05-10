'use client';
import * as React from 'react';
import { Button } from './ui/Button';
import type { Avatar } from '@/lib/types';
import { cn } from '@/lib/utils';

const SKINS = ['#FFCD9C', '#E8B083', '#C99672', '#A87A56', '#7A5236', '#3D2516'];
const HAIR = ['#1A1A1A', '#5A3621', '#A05A2C', '#D9A35A', '#E5E5E5', '#D8423B', '#7A4FA3'];

export function AvatarSvg({ avatar, size = 64 }: { avatar: Avatar; size?: number }) {
  const skin = SKINS[avatar.skinColor % SKINS.length];
  const hair = HAIR[avatar.special >= 0 ? avatar.special % HAIR.length : 0];
  const eyes = avatar.eyes % 4;
  const mouth = avatar.mouth % 4;

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className="block"
      aria-hidden="true"
    >
      {/* head */}
      <circle cx="50" cy="55" r="34" fill={skin} stroke="#1c1f26" strokeWidth="3" />
      {/* hair tuft */}
      {avatar.special >= 0 && (
        <path
          d="M22 42 Q35 14 50 22 Q65 14 78 42 Q72 30 50 30 Q28 30 22 42 Z"
          fill={hair}
          stroke="#1c1f26"
          strokeWidth="3"
        />
      )}
      {/* eyes */}
      {eyes === 0 && (
        <>
          <circle cx="38" cy="52" r="3.5" fill="#1c1f26" />
          <circle cx="62" cy="52" r="3.5" fill="#1c1f26" />
        </>
      )}
      {eyes === 1 && (
        <>
          <path d="M33 52 L43 52" stroke="#1c1f26" strokeWidth="3" strokeLinecap="round" />
          <path d="M57 52 L67 52" stroke="#1c1f26" strokeWidth="3" strokeLinecap="round" />
        </>
      )}
      {eyes === 2 && (
        <>
          <circle cx="38" cy="52" r="5" fill="#fff" stroke="#1c1f26" strokeWidth="2" />
          <circle cx="62" cy="52" r="5" fill="#fff" stroke="#1c1f26" strokeWidth="2" />
          <circle cx="38" cy="52" r="2" fill="#1c1f26" />
          <circle cx="62" cy="52" r="2" fill="#1c1f26" />
        </>
      )}
      {eyes === 3 && (
        <>
          <path d="M33 50 Q38 56 43 50" stroke="#1c1f26" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M57 50 Q62 56 67 50" stroke="#1c1f26" strokeWidth="3" fill="none" strokeLinecap="round" />
        </>
      )}
      {/* mouth */}
      {mouth === 0 && <path d="M40 70 Q50 78 60 70" stroke="#1c1f26" strokeWidth="3" fill="none" strokeLinecap="round" />}
      {mouth === 1 && <line x1="40" y1="72" x2="60" y2="72" stroke="#1c1f26" strokeWidth="3" strokeLinecap="round" />}
      {mouth === 2 && <ellipse cx="50" cy="72" rx="6" ry="4" fill="#bb3a35" stroke="#1c1f26" strokeWidth="2" />}
      {mouth === 3 && <path d="M40 74 Q50 66 60 74" stroke="#1c1f26" strokeWidth="3" fill="none" strokeLinecap="round" />}
    </svg>
  );
}

export function AvatarPicker({
  avatar,
  onChange,
}: {
  avatar: Avatar;
  onChange: (a: Avatar) => void;
}) {
  const cycle = (key: keyof Avatar, max: number, dir: 1 | -1) => {
    const cur = avatar[key];
    const next = ((cur + dir + max + 1) % (max + 1)) | 0;
    onChange({ ...avatar, [key]: next });
  };

  const Row = ({ label, value, max, k }: { label: string; value: number; max: number; k: keyof Avatar }) => (
    <div className="flex items-center justify-between gap-3">
      <span className="w-20 text-sm font-semibold text-ink-soft">{label}</span>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => cycle(k, max, -1)} aria-label={`Previous ${label}`}>
          ‹
        </Button>
        <span className="w-8 text-center text-sm tabular-nums">{value}</span>
        <Button size="sm" variant="secondary" onClick={() => cycle(k, max, 1)} aria-label={`Next ${label}`}>
          ›
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col items-center gap-4">
      <div className={cn('rounded-full border-2 border-ink bg-paper-dark shadow-doodle p-2')}>
        <AvatarSvg avatar={avatar} size={120} />
      </div>
      <div className="grid w-full max-w-xs gap-2">
        <Row label="Skin" value={avatar.skinColor} max={SKINS.length - 1} k="skinColor" />
        <Row label="Eyes" value={avatar.eyes} max={3} k="eyes" />
        <Row label="Mouth" value={avatar.mouth} max={3} k="mouth" />
        <Row label="Hair" value={avatar.special + 1} max={HAIR.length - 1} k="special" />
      </div>
    </div>
  );
}
