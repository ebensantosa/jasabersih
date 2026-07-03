'use client';

import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { useState } from 'react';

export function SortableRow({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <tr
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className="border-t hover:bg-slate-50"
    >
      <td className="w-8 px-2 py-2">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none rounded p-1 text-slate-300 hover:text-slate-500 active:cursor-grabbing"
        >
          <GripVertical size={16} />
        </button>
      </td>
      {children}
    </tr>
  );
}

export function SortableTable<T extends { id: string }>({
  items,
  onReorder,
  head,
  renderRow,
}: {
  items: T[];
  onReorder: (newItems: T[]) => void;
  head: React.ReactNode;
  renderRow: (item: T, idx: number) => React.ReactNode;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = items.findIndex((i) => i.id === active.id);
    const newIdx = items.findIndex((i) => i.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const next = [...items];
    const [moved] = next.splice(oldIdx, 1);
    next.splice(newIdx, 0, moved!);
    onReorder(next);
  }

  const activeItem = activeId ? items.find((i) => i.id === activeId) : null;
  const activeIdx = activeItem ? items.indexOf(activeItem) : -1;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="w-8 px-2 py-2" />
            {head}
          </tr>
        </thead>
        <tbody>
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            {items.map((item, idx) => renderRow(item, idx))}
          </SortableContext>
        </tbody>
      </table>

      <DragOverlay>
        {activeItem ? (
          <table className="w-full text-sm shadow-lg">
            <tbody>
              <tr className="border bg-white">
                <td className="w-8 px-2 py-2">
                  <GripVertical size={16} className="text-slate-400" />
                </td>
                {renderRow(activeItem, activeIdx)}
              </tr>
            </tbody>
          </table>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
