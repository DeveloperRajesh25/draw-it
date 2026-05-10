'use client';
import * as React from 'react';
import { nanoid } from 'nanoid';
import { CANVAS_HEIGHT, CANVAS_WIDTH, TIMING } from '@/lib/constants';
import type { Stroke, StrokePreviewSegment, Tool } from '@/lib/types';
import { broadcastStrokePreview, subscribeStrokePreviews } from '@/lib/use-room';

type Props = {
  roomCode: string;
  strokes: Stroke[];
  canDraw: boolean;
  tool: Tool;
  color: string;
  size: number;
  onCommitStroke: (s: {
    id: string;
    tool: Tool;
    color: string;
    size: number;
    points: number[];
  }) => void;
};

/**
 * Single drawing canvas. Two responsibilities:
 *   1. Render committed strokes (`props.strokes`) and overlay live previews.
 *   2. If the local player is the drawer, capture pointer events and:
 *        - draw locally (optimistic),
 *        - broadcast preview segments at ~30fps,
 *        - on pointerup, commit the full stroke via props.onCommitStroke.
 *
 * Live previews from other clients are received via subscribeStrokePreviews()
 * and rendered immediately. We dedupe by stroke ID against the committed
 * Postgres-via-Realtime arrival.
 */
export function Canvas(props: Props) {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const baseRef = React.useRef<HTMLCanvasElement>(null);   // committed strokes
  const liveRef = React.useRef<HTMLCanvasElement>(null);   // in-progress preview overlay

  const renderedIdsRef = React.useRef<Set<string>>(new Set());
  const previewStateRef = React.useRef<Map<string, { tool: Tool; color: string; size: number; points: number[] }>>(new Map());

  // Drawer-local stroke
  const drawingRef = React.useRef<{
    id: string;
    tool: Tool;
    color: string;
    size: number;
    points: number[];     // [x0,y0,x1,y1,...]
    pendingFromIdx: number; // start index in points for the next broadcast batch
    flushTimer: number | null;
    pointerId: number | null;
  } | null>(null);

  const dprRef = React.useRef(1);

  // ===== Sizing =====
  React.useEffect(() => {
    const canvases = [baseRef.current, liveRef.current].filter(Boolean) as HTMLCanvasElement[];
    if (canvases.length === 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    dprRef.current = dpr;
    canvases.forEach((c) => {
      c.width = CANVAS_WIDTH * dpr;
      c.height = CANVAS_HEIGHT * dpr;
      const ctx = c.getContext('2d');
      ctx?.scale(dpr, dpr);
    });
    redrawBase();
    redrawLive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== Subscribe to broadcast previews =====
  React.useEffect(() => {
    const unsub = subscribeStrokePreviews(props.roomCode, (seg: StrokePreviewSegment) => {
      // If we already rendered the committed version, skip.
      if (renderedIdsRef.current.has(seg.strokeId)) return;
      const prev = previewStateRef.current.get(seg.strokeId);
      const nextPoints = prev ? [...prev.points, ...seg.points] : seg.points.slice();
      previewStateRef.current.set(seg.strokeId, {
        tool: seg.tool,
        color: seg.color,
        size: seg.size,
        points: nextPoints,
      });
      drawIncrementOnLive({ ...seg, points: nextPoints }, prev?.points.length ?? 0);
      if (seg.done) {
        // Ephemeral preview lingers until the committed Postgres event lands.
      }
    });
    return unsub;
  }, [props.roomCode]);

  // ===== Whenever props.strokes changes, redraw base =====
  React.useEffect(() => {
    redrawBase();
    // Drop preview state for strokes now committed.
    for (const s of props.strokes) {
      if (previewStateRef.current.has(s.id)) previewStateRef.current.delete(s.id);
      renderedIdsRef.current.add(s.id);
    }
    // Also redraw live to keep any in-progress non-committed previews.
    redrawLive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.strokes]);

  // ===== Base redraw (full) =====
  const redrawBase = React.useCallback(() => {
    const c = baseRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.scale(dprRef.current, dprRef.current);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    for (const s of props.strokes) {
      drawStrokeOn(ctx, s);
    }
    ctx.restore();
    renderedIdsRef.current = new Set(props.strokes.map((s) => s.id));
  }, [props.strokes]);

  const redrawLive = React.useCallback(() => {
    const c = liveRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.scale(dprRef.current, dprRef.current);
    // Replay any preview state we still have
    for (const [id, p] of previewStateRef.current) {
      if (renderedIdsRef.current.has(id)) continue;
      drawStrokeOn(ctx, {
        id,
        tool: p.tool,
        color: p.color,
        size: p.size,
        points: p.points,
        // these are unused
        roomCode: '',
        turnKey: '',
        seq: 0,
        createdAt: '',
      });
    }
    // Plus the active local stroke if drawer
    if (drawingRef.current) {
      drawStrokeOn(ctx, {
        id: drawingRef.current.id,
        tool: drawingRef.current.tool,
        color: drawingRef.current.color,
        size: drawingRef.current.size,
        points: drawingRef.current.points,
        roomCode: '',
        turnKey: '',
        seq: 0,
        createdAt: '',
      });
    }
    ctx.restore();
  }, []);

  function drawIncrementOnLive(seg: StrokePreviewSegment, prevPointsLen: number) {
    const c = liveRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dprRef.current, dprRef.current);
    drawStrokeOn(
      ctx,
      {
        id: seg.strokeId,
        tool: seg.tool,
        color: seg.color,
        size: seg.size,
        points: seg.points,
        roomCode: '',
        turnKey: '',
        seq: 0,
        createdAt: '',
      },
      prevPointsLen,
    );
    ctx.restore();
  }

  // ===== Pointer handling =====
  const eventToCanvas = (e: React.PointerEvent<HTMLDivElement>): [number, number] => {
    const rect = (wrapRef.current as HTMLDivElement).getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
    const y = ((e.clientY - rect.top) / rect.height) * CANVAS_HEIGHT;
    return [x, y];
  };

  const startStroke = (x: number, y: number, pointerId: number) => {
    if (!props.canDraw) return;
    if (props.tool === 'fill') {
      // Single-shot stroke; immediate commit.
      const id = nanoid();
      const stroke = {
        id,
        tool: 'fill' as Tool,
        color: props.color,
        size: 1,
        points: [x, y],
      };
      // Apply locally to base
      const baseCtx = baseRef.current?.getContext('2d');
      if (baseCtx) {
        baseCtx.save();
        baseCtx.setTransform(1, 0, 0, 1, 0, 0);
        baseCtx.scale(dprRef.current, dprRef.current);
        applyFill(baseCtx, x, y, props.color);
        baseCtx.restore();
        renderedIdsRef.current.add(id);
      }
      props.onCommitStroke(stroke);
      return;
    }
    drawingRef.current = {
      id: nanoid(),
      tool: props.tool,
      color: props.color,
      size: props.size,
      points: [x, y],
      pendingFromIdx: 0,
      flushTimer: null,
      pointerId,
    };
    redrawLive();
    scheduleFlush();
  };

  const continueStroke = (x: number, y: number) => {
    const cur = drawingRef.current;
    if (!cur) return;
    cur.points.push(x, y);
    redrawLive();
  };

  const endStroke = () => {
    const cur = drawingRef.current;
    if (!cur) return;
    drawingRef.current = null;
    // Final flush via broadcast (so latency-sensitive watchers see the last points
    // without waiting on Postgres CDC).
    flushBroadcast(cur, true);
    // Move it to base canvas
    const baseCtx = baseRef.current?.getContext('2d');
    if (baseCtx) {
      baseCtx.save();
      baseCtx.setTransform(1, 0, 0, 1, 0, 0);
      baseCtx.scale(dprRef.current, dprRef.current);
      drawStrokeOn(baseCtx, {
        id: cur.id,
        tool: cur.tool,
        color: cur.color,
        size: cur.size,
        points: cur.points,
        roomCode: '',
        turnKey: '',
        seq: 0,
        createdAt: '',
      });
      baseCtx.restore();
      renderedIdsRef.current.add(cur.id);
    }
    redrawLive();
    // Commit
    props.onCommitStroke({
      id: cur.id,
      tool: cur.tool,
      color: cur.color,
      size: cur.size,
      points: cur.points,
    });
  };

  const scheduleFlush = () => {
    const cur = drawingRef.current;
    if (!cur) return;
    if (cur.flushTimer != null) return;
    cur.flushTimer = window.setTimeout(() => {
      const c2 = drawingRef.current;
      if (!c2) return;
      c2.flushTimer = null;
      flushBroadcast(c2, false);
      if (drawingRef.current) scheduleFlush();
    }, TIMING.STROKE_FLUSH_INTERVAL_MS) as unknown as number;
  };

  const flushBroadcast = (
    s: { id: string; tool: Tool; color: string; size: number; points: number[]; pendingFromIdx: number },
    done: boolean,
  ) => {
    const slice = s.points.slice(s.pendingFromIdx);
    if (slice.length < 2 && !done) return;
    if (slice.length >= 2) {
      // Add a leading anchor so far-side rendering can connect to last-known segment.
      const anchor = s.pendingFromIdx >= 2 ? [s.points[s.pendingFromIdx - 2], s.points[s.pendingFromIdx - 1]] : [];
      broadcastStrokePreview(props.roomCode, {
        strokeId: s.id,
        tool: s.tool,
        color: s.color,
        size: s.size,
        points: [...anchor, ...slice],
        done,
      });
    }
    s.pendingFromIdx = s.points.length;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!props.canDraw) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const [x, y] = eventToCanvas(e);
    startStroke(x, y, e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drawingRef.current) return;
    if (e.pointerId !== drawingRef.current.pointerId) return;
    const [x, y] = eventToCanvas(e);
    continueStroke(x, y);
  };

  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drawingRef.current) return;
    if (e.pointerId !== drawingRef.current.pointerId) return;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    endStroke();
  };

  return (
    <div className="relative w-full overflow-hidden">
      <div
        ref={wrapRef}
        className="canvas-paper relative w-full overflow-hidden rounded-lg border-2 border-ink shadow-doodle"
        style={{ aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}`, touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <canvas
          ref={baseRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
        />
        <canvas
          ref={liveRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, pointerEvents: 'none' }}
        />
        {!props.canDraw && (
          <div
            className="pointer-events-none absolute inset-0"
            aria-hidden="true"
            style={{ touchAction: 'none' }}
          />
        )}
      </div>
    </div>
  );
}

// ===== Drawing primitives =====

function drawStrokeOn(
  ctx: CanvasRenderingContext2D,
  s: Stroke,
  fromPointIdx = 0,
) {
  if (s.tool === 'fill') {
    if (s.points.length >= 2) {
      applyFill(ctx, s.points[0], s.points[1], s.color);
    }
    return;
  }
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = s.size;
  ctx.strokeStyle = s.color;
  if (s.tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
  } else {
    ctx.globalCompositeOperation = 'source-over';
  }
  const pts = s.points;
  const startIdx = Math.max(0, fromPointIdx);
  ctx.beginPath();
  if (pts.length >= 2) {
    if (startIdx === 0) {
      ctx.moveTo(pts[0], pts[1]);
      // Draw a starting dot for single-tap strokes
      ctx.lineTo(pts[0] + 0.01, pts[1] + 0.01);
    } else {
      ctx.moveTo(pts[startIdx], pts[startIdx + 1]);
    }
    let i = Math.max(2, startIdx + 2);
    for (; i + 3 < pts.length; i += 2) {
      const x0 = pts[i];
      const y0 = pts[i + 1];
      const x1 = pts[i + 2];
      const y1 = pts[i + 3];
      const mx = (x0 + x1) / 2;
      const my = (y0 + y1) / 2;
      ctx.quadraticCurveTo(x0, y0, mx, my);
    }
    if (i < pts.length) {
      ctx.lineTo(pts[pts.length - 2], pts[pts.length - 1]);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// Scanline flood fill on raw ImageData.
function applyFill(ctx: CanvasRenderingContext2D, x: number, y: number, hexColor: string) {
  const w = CANVAS_WIDTH;
  const h = CANVAS_HEIGHT;
  const xi = Math.max(0, Math.min(w - 1, Math.floor(x)));
  const yi = Math.max(0, Math.min(h - 1, Math.floor(y)));
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;
  const targetIdx = (yi * w + xi) * 4;
  const tR = data[targetIdx];
  const tG = data[targetIdx + 1];
  const tB = data[targetIdx + 2];
  const tA = data[targetIdx + 3];
  const [fR, fG, fB] = hexToRgb(hexColor);
  if (tR === fR && tG === fG && tB === fB && tA === 255) return;

  const tolerance = 6;
  const matches = (idx: number) =>
    Math.abs(data[idx] - tR) <= tolerance &&
    Math.abs(data[idx + 1] - tG) <= tolerance &&
    Math.abs(data[idx + 2] - tB) <= tolerance &&
    Math.abs(data[idx + 3] - tA) <= tolerance;

  const setPixel = (idx: number) => {
    data[idx] = fR;
    data[idx + 1] = fG;
    data[idx + 2] = fB;
    data[idx + 3] = 255;
  };

  // Iterative scanline fill.
  const stack: [number, number][] = [[xi, yi]];
  while (stack.length) {
    const [sx, sy] = stack.pop()!;
    let cx = sx;
    let idx = (sy * w + cx) * 4;
    // walk left
    while (cx >= 0 && matches(idx)) {
      cx--;
      idx -= 4;
    }
    cx++;
    idx += 4;
    let spanAbove = false;
    let spanBelow = false;
    while (cx < w && matches(idx)) {
      setPixel(idx);
      // above
      if (sy > 0) {
        const aboveIdx = idx - w * 4;
        if (matches(aboveIdx)) {
          if (!spanAbove) {
            stack.push([cx, sy - 1]);
            spanAbove = true;
          }
        } else {
          spanAbove = false;
        }
      }
      // below
      if (sy < h - 1) {
        const belowIdx = idx + w * 4;
        if (matches(belowIdx)) {
          if (!spanBelow) {
            stack.push([cx, sy + 1]);
            spanBelow = true;
          }
        } else {
          spanBelow = false;
        }
      }
      cx++;
      idx += 4;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}
