'use client';

type SubtaskReorderProps = {
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
};

/**
 * Move one step up or down in a subtask list.
 *
 * Arrows rather than dragging: the rows sit inside a form with a text input
 * and a select, where a drag that starts on the wrong pixel either selects
 * text or does nothing, and touch has no hover to hint the handle. Two
 * buttons work the same with a mouse, a finger and a keyboard.
 */
export default function SubtaskReorder({ index, count, onMove }: SubtaskReorderProps) {
  const btn =
    'flex h-4 w-5 items-center justify-center rounded text-[9px] leading-none text-fg-muted transition-colors hover:bg-hover hover:text-fg disabled:pointer-events-none disabled:opacity-25';

  return (
    <div className="flex shrink-0 flex-col">
      <button
        type="button"
        onClick={() => onMove(index, index - 1)}
        disabled={index === 0}
        aria-label={`انتقال زیرتسک ${index + 1} به بالا`}
        title="انتقال به بالا"
        className={btn}
      >
        ▲
      </button>
      <button
        type="button"
        onClick={() => onMove(index, index + 1)}
        disabled={index === count - 1}
        aria-label={`انتقال زیرتسک ${index + 1} به پایین`}
        title="انتقال به پایین"
        className={btn}
      >
        ▼
      </button>
    </div>
  );
}
