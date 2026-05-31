import { useMemo, useState, useRef, useCallback, useEffect, memo, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { addDays, subDays, format, differenceInCalendarDays, isSameDay, parseISO, startOfDay, isBefore } from 'date-fns';
import { BOOKING_STATUSES, type Booking, type BookingStatus } from '@/types/hotel';
import { useHotelGrid } from '@/hooks/HotelGridContext';
import { AddCategoryDialog, AddRoomDialog } from './HotelCategoryDialogs';
import { toast } from 'sonner';
import { BookingBar } from './BookingBar';
import { BookingDialog } from './BookingDialog';
import { useI18n } from '@/hooks/useI18n';
import { useAuth } from '@/contexts/AuthContext';
import { ChevronDown, ChevronRight, User, Users, CalendarCheck2, Plus, X, FolderPlus, DoorOpen, Trash2, AlertTriangle, Check, Tag } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

const HALF_COL_WIDTH = 40;
const DAY_WIDTH = HALF_COL_WIDTH * 2;
const ROW_HEIGHT = 44;
const PERSON_ROW_HEIGHT = 38;
const DEFAULT_LABEL_WIDTH = 440;
const INITIAL_PAST_DAYS = 14;
const INITIAL_FUTURE_DAYS = 45;
const LOAD_MORE_DAYS = 30;
const EDGE_THRESHOLD = 600;

interface RoomGridProps {
  bookings: Booking[];
  conflictBookings?: Booking[];
  onAddBooking: (b: Booking) => void;
  onDeleteBooking: (id: string) => void;
  onUpdateBooking: (id: string, updates: Partial<Booking>) => void;
  /** When set, the grid will scroll to that booking and play a 5s glow. */
  focusBookingId?: string | null;
  /** Called once the focus has been consumed so the URL param can be cleared. */
  onFocusConsumed?: () => void;
  /** Width of the sticky category/room label column. Defaults to 440. */
  labelWidth?: number;
}

const PERSON_COUNTS: Record<string, number> = {
  'standard-double': 2, 'standard-twin': 2, 'standard-triple': 3,
  'standard-quadruple': 4, 'deluxe-twin': 2,
};

const DAY_LABELS_RU = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];
const DAY_LABELS_UZ = ['Ya', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh'];
const CATEGORY_STATUS_ORDER: BookingStatus[] = ['confirmed', 'pending', 'booked', 'in-house', 'checked-out', 'maintenance'];

const CategoryStatusStrip = memo(({ counts, lang }: { counts: Record<BookingStatus, number>; lang: string }) => (
  <div className="category-status-strip">
    {CATEGORY_STATUS_ORDER.map((status) => {
      const config = BOOKING_STATUSES[status];
      const count = counts[status] ?? 0;
      return (
        <div key={status} className={`category-status-chip${count === 0 ? ' is-empty' : ''}`} style={{ '--chip-color': config.color } as CSSProperties}>
          <span className="category-status-count">{count}</span>
          <span className="category-status-dot" />
          <span className="category-status-label">{config.label[lang as 'ru' | 'uz' | 'en']}</span>
        </div>
      );
    })}
  </div>
));
CategoryStatusStrip.displayName = 'CategoryStatusStrip';

const DayHeaderCell = memo(({ date, isToday, isPastDay, isWeekendDay, dayLabel, lang, isFirstOfMonth }: {
  date: Date; isToday: boolean; isPastDay: boolean; isWeekendDay: boolean; dayLabel: string; lang: string; isFirstOfMonth: boolean;
}) => (
  <div
    className={`day-header-cell relative flex flex-col items-center justify-center select-none ${isToday ? 'today-header-glow' : 'bg-card'}`}
    style={{ width: DAY_WIDTH, minWidth: DAY_WIDTH, height: 68, borderRight: '1px solid hsl(var(--grid-line-strong) / 0.5)', paddingBottom: 12 }}
  >
    {isFirstOfMonth && (
      <span className={`text-[8px] font-black uppercase leading-none z-10 mb-0.5 tracking-wide ${isToday ? 'opacity-90 text-white' : 'text-primary/70'}`}>
        {format(date, 'MMM')}
      </span>
    )}
    <span className={`text-[10px] font-extrabold uppercase leading-none z-10 tracking-wider ${isToday ? 'text-white' : isPastDay ? 'text-muted-foreground/50' : isWeekendDay ? 'text-destructive' : 'text-foreground/70'}`}>
      {dayLabel}
    </span>
    <span className={`text-[16px] font-black leading-tight z-10 mt-0.5 ${isToday ? 'text-white' : isPastDay ? 'text-muted-foreground/50' : 'text-foreground'}`}>
      {format(date, 'd')}
    </span>
    {isToday && (
      <span className="text-[7px] font-black uppercase tracking-wider text-white/90 z-10 mt-0.5">
        {lang === 'ru' ? 'Сегодня' : 'Bugun'}
      </span>
    )}
    <div
      className={`absolute bottom-0.5 left-0 right-0 z-10 flex items-center justify-center gap-2 text-[8px] font-bold leading-none pointer-events-none ${
        isToday ? 'text-white/95' : isPastDay ? 'text-muted-foreground/50' : 'text-foreground/55'
      }`}
    >
      <span className="flex items-center gap-[1px]">↑<span className="tabular-nums">12</span></span>
      <span className="flex items-center gap-[1px]">↓<span className="tabular-nums">14</span></span>
    </div>
  </div>
));
DayHeaderCell.displayName = 'DayHeaderCell';

/**
 * Static row background. Memoized purely on (height, totalWidth, todayIdx).
 * No `dates` array dependency — avoids re-renders when only the dates array
 * reference changes but todayIdx/length don't.
 */
const RowBackground = memo(({ height, totalWidth, todayOffset, totalDays }: {
  height: number; totalWidth: number; todayOffset: number; totalDays: number;
}) => (
  <div
    style={{
      width: totalWidth, height, position: 'absolute', top: 0, left: 0, pointerEvents: 'none',
      background: 'hsl(var(--card))',
      backgroundImage: [
        `repeating-linear-gradient(90deg, hsl(var(--grid-line-strong) / 0.55) 0px, hsl(var(--grid-line-strong) / 0.55) 1px, transparent 1px, transparent ${DAY_WIDTH}px)`,
        `repeating-linear-gradient(90deg, transparent 0px, transparent ${HALF_COL_WIDTH}px, hsl(var(--grid-line) / 0.3) ${HALF_COL_WIDTH}px, hsl(var(--grid-line) / 0.3) ${HALF_COL_WIDTH + 1}px, transparent ${HALF_COL_WIDTH + 1}px, transparent ${DAY_WIDTH}px)`,
      ].join(', '),
      backgroundSize: `${DAY_WIDTH}px ${height}px`,
    }}
  >
    {todayOffset >= 0 && todayOffset < totalDays && (
      <div
        className="today-column-glow"
        style={{
          position: 'absolute', left: todayOffset * DAY_WIDTH, top: 0,
          width: DAY_WIDTH, height,
          background: 'hsl(var(--primary-hsl) / 0.10)',
          borderLeft: '3px solid hsl(var(--primary-hsl) / 0.55)',
          borderRight: '3px solid hsl(var(--primary-hsl) / 0.55)',
        }}
      />
    )}
  </div>
));
RowBackground.displayName = 'RowBackground';

type DragSnapshot = { roomNumber: number; bedIndex?: number; startHalf: number; endHalf: number } | null;

type PersonNames = Record<number, Record<number, string>>;
type ExtraPersons = Record<number, number>;
type DeleteTarget =
  | { type: 'category'; id: string; label: string }
  | { type: 'room'; roomNumber: number }
  | { type: 'guest'; roomNumber: number; personIdx: number; isExtra: boolean };

/**
 * Drag-overlay imperative API: parent updates this without React re-rendering
 * the grid. Internally uses CSS transforms for 60fps drag selection.
 */
interface DragOverlayHandle {
  show: (roomKey: string, startHalf: number, endHalf: number, height: number) => void;
  hide: () => void;
}

/* Single overlay element per row, positioned by ref. */
const RowDragOverlay = memo(({ rowKey, registerOverlay }: {
  rowKey: string; registerOverlay: (key: string, el: HTMLDivElement | null) => void;
}) => {
  return (
    <div
      ref={(el) => registerOverlay(rowKey, el)}
      className="drag-overlay-animate"
      style={{
        position: 'absolute', left: 0, top: 0, width: 0, height: 0,
        border: '1.5px dashed hsl(var(--primary-hsl) / 0.7)',
        borderRadius: 8, pointerEvents: 'none', zIndex: 2,
        display: 'none',
      }}
    />
  );
});
RowDragOverlay.displayName = 'RowDragOverlay';

interface RoomBars {
  byRoom: Map<number, { booking: Booking; leftPx: number; widthPx: number; isPast: boolean }[]>;
  byBed: Map<string, { booking: Booking; leftPx: number; widthPx: number; isPast: boolean }[]>;
}

/**
 * Pre-bucket bookings by room (and by room+bedIndex) in a single O(N) pass,
 * so per-row rendering is O(bars-in-row) instead of O(total-bookings).
 */
function bucketBookings(
  bookings: Booking[],
  startDate: Date,
  totalDays: number,
  today: Date,
): RoomBars {
  const byRoom = new Map<number, { booking: Booking; leftPx: number; widthPx: number; isPast: boolean }[]>();
  const byBed = new Map<string, { booking: Booking; leftPx: number; widthPx: number; isPast: boolean }[]>();
  const totalPx = totalDays * DAY_WIDTH;
  for (const booking of bookings) {
    const bIn = parseISO(booking.checkIn);
    const bOut = parseISO(booking.checkOut);
    const startDayOffset = differenceInCalendarDays(bIn, startDate);
    const endDayOffset = differenceInCalendarDays(bOut, startDate);
    const earlyShift = booking.checkInHalfDay ? HALF_COL_WIDTH : 0;
    const startPx = Math.max(0, startDayOffset * DAY_WIDTH + HALF_COL_WIDTH - earlyShift);
    const halfExtra = booking.checkOutHalfDay ? HALF_COL_WIDTH : 0;
    const endPx = Math.min(totalPx, endDayOffset * DAY_WIDTH + HALF_COL_WIDTH + halfExtra);
    const w = endPx - startPx;
    if (w <= 0) continue;
    const isPast = isBefore(bOut, today);
    const item = { booking, leftPx: startPx, widthPx: w, isPast };
    if (booking.bedIndex === undefined) {
      const arr = byRoom.get(booking.roomNumber);
      if (arr) arr.push(item);
      else byRoom.set(booking.roomNumber, [item]);
    } else {
      const k = `${booking.roomNumber}:${booking.bedIndex}`;
      const arr = byBed.get(k);
      if (arr) arr.push(item);
      else byBed.set(k, [item]);
    }
  }
  return { byRoom, byBed };
}

export function HotelRoomGrid({ bookings, conflictBookings = bookings, onAddBooking, onDeleteBooking, onUpdateBooking, focusBookingId, onFocusConsumed, labelWidth }: RoomGridProps) {
  const LABEL_WIDTH = labelWidth ?? DEFAULT_LABEL_WIDTH;
  const { t, lang } = useI18n();
  const { categories, rooms, categoryRates, removeCategory, removeRoom, setCategoryRate } = useHotelGrid();
  const { user } = useAuth();
  const isManager = user?.role === 'manager';
  const canEditRate = user?.role === 'manager' || user?.role === 'superuser';
  const canSeeRate = canEditRate;
  const today = useMemo(() => startOfDay(new Date()), []);
  const [pastDays, setPastDays] = useState(INITIAL_PAST_DAYS);
  const [futureDays, setFutureDays] = useState(INITIAL_FUTURE_DAYS);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [expandedRooms, setExpandedRooms] = useState<Record<number, boolean>>({});
  const [personNames, setPersonNames] = useState<PersonNames>({});
  const [extraPersons, setExtraPersons] = useState<ExtraPersons>({});
  const [deletedPersonSlots, setDeletedPersonSlots] = useState<Record<number, Set<number>>>({});
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [addRoomCategoryId, setAddRoomCategoryId] = useState<string | null>(null);
  const [rateEditCategoryId, setRateEditCategoryId] = useState<string | null>(null);
  const [rateDraft, setRateDraft] = useState('');

  const toggleCategory = useCallback((catId: string) => {
    setCollapsedCategories(prev => ({ ...prev, [catId]: !prev[catId] }));
  }, []);
  const toggleRoomExpand = useCallback((roomNumber: number) => {
    setExpandedRooms(prev => ({ ...prev, [roomNumber]: !prev[roomNumber] }));
  }, []);
  const updatePersonName = useCallback((roomNumber: number, personIdx: number, name: string) => {
    setPersonNames(prev => ({ ...prev, [roomNumber]: { ...(prev[roomNumber] || {}), [personIdx]: name } }));
  }, []);
  const addExtraPerson = useCallback((roomNumber: number) => {
    setExtraPersons(prev => ({ ...prev, [roomNumber]: (prev[roomNumber] || 0) + 1 }));
    setExpandedRooms(prev => ({ ...prev, [roomNumber]: true }));
  }, []);
  const removeExtraPerson = useCallback((roomNumber: number, personIdx: number) => {
    setExtraPersons(prev => ({ ...prev, [roomNumber]: Math.max(0, (prev[roomNumber] || 0) - 1) }));
    setPersonNames(prev => {
      const copy = { ...(prev[roomNumber] || {}) };
      delete copy[personIdx];
      return { ...prev, [roomNumber]: copy };
    });
  }, []);

  const confirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'category') {
      removeCategory(deleteTarget.id);
      toast.success(lang === 'ru' ? `Категория удалена: ${deleteTarget.label}` : `Category deleted: ${deleteTarget.label}`);
    } else if (deleteTarget.type === 'room') {
      removeRoom(deleteTarget.roomNumber);
      toast.success(lang === 'ru' ? `Номер ${deleteTarget.roomNumber} удалён` : `Room ${deleteTarget.roomNumber} deleted`);
    } else if (deleteTarget.isExtra) {
      removeExtraPerson(deleteTarget.roomNumber, deleteTarget.personIdx);
      toast.success(lang === 'ru' ? 'Гость удалён' : 'Guest deleted');
    } else {
      setDeletedPersonSlots((prev) => {
        const next = new Set(prev[deleteTarget.roomNumber] ?? []);
        next.add(deleteTarget.personIdx);
        return { ...prev, [deleteTarget.roomNumber]: next };
      });
      setPersonNames((prev) => {
        const copy = { ...(prev[deleteTarget.roomNumber] || {}) };
        delete copy[deleteTarget.personIdx];
        return { ...prev, [deleteTarget.roomNumber]: copy };
      });
      toast.success(lang === 'ru' ? 'Гость удалён' : 'Guest deleted');
    }
    setDeleteTarget(null);
  }, [deleteTarget, lang, removeCategory, removeRoom, removeExtraPerson]);

  const openRateEditor = useCallback((categoryId: string) => {
    setRateEditCategoryId(categoryId);
    setRateDraft(categoryRates[categoryId] ? String(categoryRates[categoryId]) : '');
  }, [categoryRates]);

  const saveRate = useCallback(() => {
    if (!rateEditCategoryId) return;
    const parsed = Number(String(rateDraft).replace(/[^0-9.]/g, ''));
    const cleanRate = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    setCategoryRate(rateEditCategoryId, cleanRate);
    toast.success(lang === 'ru' ? `Цена сохранена: ${cleanRate.toLocaleString('ru-RU')} сум` : `Price saved: ${cleanRate.toLocaleString('ru-RU')} UZS`);
    setRateEditCategoryId(null);
    setRateDraft('');
  }, [lang, rateEditCategoryId, rateDraft, setCategoryRate]);

  const startDate = useMemo(() => subDays(today, pastDays), [today, pastDays]);
  const totalDays = pastDays + futureDays;
  const dates = useMemo(() => Array.from({ length: totalDays }, (_, i) => addDays(startDate, i)), [startDate, totalDays]);
  const todayIdx = pastDays;
  const totalWidth = totalDays * DAY_WIDTH;
  const scrollRef = useRef<HTMLDivElement>(null);
  const didInitialScroll = useRef(false);
  const isPrependingRef = useRef(false);
  const scrollRafRef = useRef<number | null>(null);

  // Pre-bucket bookings by row — single O(N) pass, recomputed only when bookings/dates change.
  const buckets = useMemo(
    () => bucketBookings(bookings, startDate, totalDays, today),
    [bookings, startDate, totalDays, today],
  );

  // Per-category status counts — auto-recomputes on add/delete/update.
  const categoryStatusCounts = useMemo(() => {
    const roomCat = new Map<number, string>();
    for (const r of rooms) roomCat.set(r.number, r.category);
    const out: Record<string, Record<BookingStatus, number>> = {};
    for (const c of categories) {
      out[c.id] = { confirmed: 0, pending: 0, booked: 0, 'in-house': 0, 'checked-out': 0, maintenance: 0 };
    }
    for (const b of bookings) {
      const cat = roomCat.get(b.roomNumber);
      if (cat && out[cat]) out[cat][b.status] = (out[cat][b.status] ?? 0) + 1;
    }
    return out;
  }, [bookings, rooms, categories]);

  /* ──────────── Header drag-to-pan ─ direct listeners, zero React re-renders per move ──────────── */
  const handleHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    // Only respond to primary button
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startScroll = el.scrollLeft;
    el.classList.add('is-panning');

    let raf: number | null = null;
    let pendingX = startX;
    const apply = () => {
      raf = null;
      el.scrollLeft = startScroll - (pendingX - startX);
    };
    const move = (ev: MouseEvent) => {
      pendingX = ev.clientX;
      if (raf == null) raf = requestAnimationFrame(apply);
    };
    const up = () => {
      if (raf != null) cancelAnimationFrame(raf);
      el.classList.remove('is-panning');
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move, { passive: true });
    window.addEventListener('mouseup', up);
  }, []);

  // For admin & manager grids, position today near the left with ~2 days before
  // it so the rest of the visible columns show upcoming dates. Director keeps
  // the original centered view.
  const isAdminOrManager = user?.role === 'admin' || user?.role === 'manager';
  const computeTodayScroll = useCallback((el: HTMLElement) => {
    if (isAdminOrManager) {
      return Math.max(0, (todayIdx - 2) * DAY_WIDTH);
    }
    return Math.max(0, todayIdx * DAY_WIDTH - el.clientWidth / 3);
  }, [todayIdx, isAdminOrManager]);

  const scrollToToday = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: computeTodayScroll(el), behavior: 'smooth' });
  }, [computeTodayScroll]);

  useEffect(() => {
    if (didInitialScroll.current) return;
    const el = scrollRef.current;
    if (el) {
      el.scrollLeft = computeTodayScroll(el);
      didInitialScroll.current = true;
    }
  }, [computeTodayScroll]);

  useEffect(() => {
    if (isPrependingRef.current && scrollRef.current) {
      scrollRef.current.scrollLeft += LOAD_MORE_DAYS * DAY_WIDTH;
      isPrependingRef.current = false;
    }
  }, [pastDays]);

  /* ──────────── Focus a booking from URL param: scroll-into-view + glow ──────────── */
  useEffect(() => {
    if (!focusBookingId) return;
    const targetBooking = bookings.find((b) => b.id === focusBookingId);
    if (!targetBooking) return;

    // Make sure the row is actually rendered: un-collapse the category that
    // owns the room, and (when the booking is on a specific bed) expand the
    // room so the per-bed row exists in the DOM.
    const room = rooms.find((r) => r.number === targetBooking.roomNumber);
    if (room && collapsedCategories[room.category]) {
      setCollapsedCategories((prev) => ({ ...prev, [room.category]: false }));
    }
    if (targetBooking.bedIndex !== undefined && !expandedRooms[targetBooking.roomNumber]) {
      setExpandedRooms((prev) => ({ ...prev, [targetBooking.roomNumber]: true }));
    }

    // If the booking's check-in is far in the past, ensure we have enough past days loaded.
    const diff = differenceInCalendarDays(today, parseISO(targetBooking.checkIn));
    if (diff > pastDays - 3) {
      setPastDays((prev) => Math.max(prev, diff + LOAD_MORE_DAYS));
      // Wait for re-render before scrolling
      return;
    }

    // Defer two frames so DOM is laid out with up-to-date dates/buckets and
    // any newly-expanded rows have measured their final positions.
    let raf2 = 0;
    const raf = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (!el) return;
        const node = el.querySelector<HTMLElement>(`[data-booking-id="${CSS.escape(focusBookingId)}"]`);
        if (!node) return;

        // Horizontal scroll: center the bar in the viewport, accounting for
        // the sticky LABEL_WIDTH column on the left.
        const left = parseFloat(node.style.left || '0');
        const width = parseFloat(node.style.width || '0');
        const visibleWidth = el.clientWidth - LABEL_WIDTH;
        const target = Math.max(0, left + width / 2 - visibleWidth / 2);
        el.scrollTo({ left: target, behavior: 'smooth' });

        // Vertical: scroll the row into view inside the timeline scroller
        // (not the page) so the navbar stays visible.
        const rowRect = node.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const verticalDelta = rowRect.top - elRect.top - el.clientHeight / 2 + rowRect.height / 2;
        el.scrollBy({ top: verticalDelta, behavior: 'smooth' });

        node.classList.add('booking-focus-glow');
        const timer = window.setTimeout(() => {
          node.classList.remove('booking-focus-glow');
          onFocusConsumed?.();
        }, 5000);
        (node as HTMLElement & { _focusTimer?: number })._focusTimer = timer;
      });
    });
    return () => {
      cancelAnimationFrame(raf);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [focusBookingId, bookings, rooms, pastDays, today, collapsedCategories, expandedRooms, onFocusConsumed]);

  // rAF-throttled edge detection — avoids state churn on every scroll event.
  const handleScroll = useCallback(() => {
    if (scrollRafRef.current != null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const el = scrollRef.current;
      if (!el) return;
      if (el.scrollLeft + el.clientWidth >= el.scrollWidth - EDGE_THRESHOLD) {
        setFutureDays(prev => prev + LOAD_MORE_DAYS);
      }
      if (el.scrollLeft <= EDGE_THRESHOLD && !isPrependingRef.current) {
        isPrependingRef.current = true;
        setPastDays(prev => prev + LOAD_MORE_DAYS);
      }
    });
  }, []);

  /* ────────────  Cell drag selection — REF-BASED, zero re-renders per pixel  ──────────── */
  const dragRef = useRef<{ roomKey: string; roomNumber: number; bedIndex?: number; height: number; startHalf: number; endHalf: number; invalid: boolean } | null>(null);
  const overlayElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const isDraggingRef = useRef(false);
  const dragRafRef = useRef<number | null>(null);

  const registerOverlay = useCallback((key: string, el: HTMLDivElement | null) => {
    if (el) overlayElsRef.current.set(key, el);
    else overlayElsRef.current.delete(key);
  }, []);

  // Convert an existing booking into a [startHalf, endHalf) half-cell span on
  // the current dates window, accounting for early check-in / late checkout
  // half-cell extensions. Two bookings overlap iff their half-spans intersect.
  const bookingHalfSpan = useCallback((b: Booking): [number, number] | null => {
    const sd = datesRef.current[0];
    if (!sd) return null;
    const startDay = differenceInCalendarDays(parseISO(b.checkIn), sd);
    const endDay = differenceInCalendarDays(parseISO(b.checkOut), sd);
    const startHalf = 2 * startDay + 1 - (b.checkInHalfDay ? 1 : 0);
    const endHalf = 2 * endDay + 1 + (b.checkOutHalfDay ? 1 : 0);
    return [startHalf, endHalf];
  }, []);

  const rowsConflict = useCallback((a: Pick<Booking, 'roomNumber' | 'bedIndex' | 'status'>, b: Pick<Booking, 'roomNumber' | 'bedIndex' | 'status'>) => {
    if (a.roomNumber !== b.roomNumber) return false;
    const aRoomWide = a.status === 'maintenance' || a.bedIndex === undefined;
    const bRoomWide = b.status === 'maintenance' || b.bedIndex === undefined;
    return aRoomWide || bRoomWide || a.bedIndex === b.bedIndex;
  }, []);

  const hasBookingConflict = useCallback((candidate: Pick<Booking, 'roomNumber' | 'bedIndex' | 'status'>, startHalf: number, endHalf: number, excludeId?: string) => {
    return conflictBookingsRef.current.some((b) => {
      if (b.id === excludeId || !rowsConflict(candidate, b)) return false;
      const span = bookingHalfSpan(b);
      return !!span && span[0] < endHalf && span[1] > startHalf;
    });
  }, [bookingHalfSpan, rowsConflict]);

  const showOverlapError = useCallback(() => {
    toast.error(t('overlapError'));
  }, [t]);

  const computeDragOverlap = useCallback(() => {
    const d = dragRef.current;
    if (!d) return false;
    const startHalf = Math.min(d.startHalf, d.endHalf);
    const endHalfRaw = Math.max(d.startHalf, d.endHalf);
    const startDayIdx = Math.floor(startHalf / 2);
    let endDayIdx = Math.floor(endHalfRaw / 2);
    if (endDayIdx <= startDayIdx) endDayIdx = startDayIdx + 1;
    // New bookings always materialize as 14:00 → 12:00. Snap to the same
    // half-cells the final booking will occupy so the red preview matches
    // exactly what would actually be created.
    const newStartHalf = 2 * startDayIdx + 1;
    const newEndHalf = 2 * endDayIdx + 1;
    return hasBookingConflict({ roomNumber: d.roomNumber, bedIndex: d.bedIndex, status: 'confirmed' }, newStartHalf, newEndHalf);
  }, [hasBookingConflict]);

  const paintOverlay = useCallback(() => {
    const d = dragRef.current;
    if (!d) return;
    const el = overlayElsRef.current.get(d.roomKey);
    if (!el) return;
    const minH = Math.min(d.startHalf, d.endHalf);
    const maxH = Math.max(d.startHalf, d.endHalf);
    const left = minH * HALF_COL_WIDTH;
    const width = (maxH - minH + 1) * HALF_COL_WIDTH;
    el.style.display = 'block';
    el.style.transform = `translate3d(${left}px, 0, 0)`;
    el.style.width = `${width}px`;
    el.style.height = `${d.height}px`;
    el.dataset.invalid = d.invalid ? 'true' : 'false';
  }, []);

  const hideAllOverlays = useCallback(() => {
    const d = dragRef.current;
    if (d) {
      const el = overlayElsRef.current.get(d.roomKey);
      if (el) { el.style.display = 'none'; el.dataset.invalid = 'false'; }
    }
  }, []);

  // Dialog state (set on mouseup commit only).
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(101);
  const [selectedBedIndex, setSelectedBedIndex] = useState<number | undefined>(undefined);
  const [selectedPrefillName, setSelectedPrefillName] = useState<string>('');
  const [selectedCheckIn, setSelectedCheckIn] = useState(format(today, 'yyyy-MM-dd'));
  const [selectedCheckOut, setSelectedCheckOut] = useState(format(addDays(today, 2), 'yyyy-MM-dd'));
  const [selectedEarlyCheckin, setSelectedEarlyCheckin] = useState(false);
  const [selectedLateCheckout, setSelectedLateCheckout] = useState(false);
  const [editBooking, setEditBooking] = useState<Booking | null>(null);

  // Stable refs for handlers used on each cell — avoid re-creating closures.
  const datesRef = useRef(dates);
  datesRef.current = dates;
  const totalDaysRef = useRef(totalDays);
  totalDaysRef.current = totalDays;
  const personNamesRef = useRef(personNames);
  personNamesRef.current = personNames;
  const bookingsRef = useRef(bookings);
  bookingsRef.current = bookings;
  const conflictBookingsRef = useRef(conflictBookings);
  conflictBookingsRef.current = conflictBookings;

  const handleCellMouseDown = useCallback((roomNumber: number, bedIndex: number | undefined, height: number, e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const halfIdx = Math.floor(x / HALF_COL_WIDTH);
    const roomKey = bedIndex === undefined ? `${roomNumber}` : `${roomNumber}:${bedIndex}`;
    isDraggingRef.current = true;
    dragRef.current = { roomKey, roomNumber, bedIndex, height, startHalf: halfIdx, endHalf: halfIdx, invalid: false };
    paintOverlay();
  }, [paintOverlay]);

  // Single window-level mousemove: handles drag for the active row.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !dragRef.current) return;
      const el = overlayElsRef.current.get(dragRef.current.roomKey);
      if (!el || !el.parentElement) return;
      const rect = el.parentElement.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const halfIdx = Math.max(0, Math.min(Math.floor(x / HALF_COL_WIDTH), totalDaysRef.current * 2 - 1));
      if (dragRef.current.endHalf === halfIdx) return;
      dragRef.current.endHalf = halfIdx;
      dragRef.current.invalid = computeDragOverlap();
      if (dragRafRef.current == null) {
        dragRafRef.current = requestAnimationFrame(() => {
          dragRafRef.current = null;
          paintOverlay();
        });
      }
    };

    const onUp = () => {
      if (!isDraggingRef.current || !dragRef.current) {
        isDraggingRef.current = false;
        return;
      }
      const d = dragRef.current;
      isDraggingRef.current = false;
      hideAllOverlays();

      // INITIAL CREATION RULE: regardless of which half-cell the user
      // pressed/released on, a brand-new booking always starts at 14:00 of
      // the selected first day and ends at 12:00 of the selected last day.
      // Early check-in (08:00) and late checkout (24:00) are only available
      // AFTER the booking exists, by dragging its left/right edge — handled
      // in BookingBar via onResize / onResizeLeft.
      const startHalf = Math.min(d.startHalf, d.endHalf);
      const endHalf = Math.max(d.startHalf, d.endHalf);
      const startDayIdx = Math.floor(startHalf / 2);
      let endDayIdx = Math.floor(endHalf / 2);
      // Ensure at least one full night between check-in and check-out.
      if (endDayIdx <= startDayIdx) endDayIdx = startDayIdx + 1;
      const dts = datesRef.current;
      const checkInDate = dts[startDayIdx];
      const checkOutDate = dts[endDayIdx] ?? addDays(dts[startDayIdx], 1);
      dragRef.current = null;

      if (isBefore(checkInDate, today)) {
        toast.error(t('pastBookingError'));
        return;
      }
      // Overlap guard: refuse drag-create that lands on (or even half-touches)
      // an existing booking in the same room/bed — uses half-cell precision
      // so adjacent bookings with early/late half-day extensions are caught.
      // Maintenance and whole-room bookings (bedIndex === undefined) block
      // every bed in that room.
      const newStartHalf = 2 * startDayIdx + 1;
      const newEndHalf = 2 * endDayIdx + 1;
      const overlaps = hasBookingConflict({ roomNumber: d.roomNumber, bedIndex: d.bedIndex, status: 'confirmed' }, newStartHalf, newEndHalf);
      if (overlaps) {
        showOverlapError();
        return;
      }
      setSelectedRoom(d.roomNumber);
      setSelectedBedIndex(d.bedIndex);
      setSelectedPrefillName(
        d.bedIndex !== undefined ? (personNamesRef.current[d.roomNumber]?.[d.bedIndex] || '') : ''
      );
      setSelectedCheckIn(format(checkInDate, 'yyyy-MM-dd'));
      setSelectedCheckOut(format(checkOutDate, 'yyyy-MM-dd'));
      // Force standard 14:00 → 12:00 window for any new booking.
      setSelectedEarlyCheckin(false);
      setSelectedLateCheckout(false);
      setEditBooking(null);
      setDialogOpen(true);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (dragRafRef.current != null) cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = null;
    };
  }, [today, t, paintOverlay, hideAllOverlays, computeDragOverlap, hasBookingConflict, showOverlapError, lang]);

  /* ──────────── Booking move: middle-mouse drag-to-relocate ──────────── */
  type MoveGhost = {
    booking: Booking;
    width: number;
    height: number;
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
    targetRoom: number | null;
    targetBed: number | undefined;
    targetCheckIn: string | null;
    targetCheckOut: string | null;
    invalid: boolean;
  };
  type MoveConfirm = {
    booking: Booking;
    targetRoom: number;
    targetBed: number | undefined;
    targetCheckIn: string;
    targetCheckOut: string;
  };
  const [moveGhost, setMoveGhost] = useState<MoveGhost | null>(null);
  const [moveConfirm, setMoveConfirm] = useState<MoveConfirm | null>(null);
  const moveGhostRef = useRef<MoveGhost | null>(null);
  moveGhostRef.current = moveGhost;

  const handleBookingMoveStart = useCallback((booking: Booking, e: React.MouseEvent) => {
    if (isBefore(parseISO(booking.checkOut), today)) return; // past bookings: do not move
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const ghost: MoveGhost = {
      booking,
      width: rect.width,
      height: rect.height,
      x: e.clientX,
      y: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      targetRoom: null,
      targetBed: undefined,
      targetCheckIn: null,
      targetCheckOut: null,
      invalid: false,
    };
    setMoveGhost(ghost);
  }, [today]);

  // Global mousemove/mouseup for booking move.
  useEffect(() => {
    if (!moveGhost) return;
    const original = moveGhost.booking;
    const nights = Math.max(1, differenceInCalendarDays(parseISO(original.checkOut), parseISO(original.checkIn)));

    const onMove = (e: MouseEvent) => {
      // Detect drop target row beneath cursor
      const ghost = moveGhostRef.current;
      if (!ghost) return;
      // Temporarily allow pointer events to pass through ghost
      const el = document.elementFromPoint(e.clientX, e.clientY);
      let row: HTMLElement | null = null;
      let cur: HTMLElement | null = el as HTMLElement | null;
      while (cur) {
        if (cur.dataset && cur.dataset.gridRow === 'true') { row = cur; break; }
        cur = cur.parentElement;
      }
      let targetRoom: number | null = null;
      let targetBed: number | undefined = undefined;
      let targetCheckIn: string | null = null;
      let targetCheckOut: string | null = null;
      let invalid = false;
      if (row) {
        const rRoom = Number(row.dataset.roomNumber);
        const bedRaw = row.dataset.bedIndex ?? '';
        const rBed = bedRaw === '' ? undefined : Number(bedRaw);
        const rowRect = row.getBoundingClientRect();
        const x = e.clientX - rowRect.left - ghost.offsetX + HALF_COL_WIDTH; // anchor near bar left
        const dayIdx = Math.max(0, Math.min(totalDaysRef.current - 1, Math.round(x / DAY_WIDTH)));
        const dts = datesRef.current;
        const ci = dts[dayIdx];
        const co = addDays(ci, nights);
        targetRoom = rRoom;
        targetBed = rBed;
        targetCheckIn = format(ci, 'yyyy-MM-dd');
        targetCheckOut = format(co, 'yyyy-MM-dd');
        if (isBefore(ci, today)) invalid = true;
        if (!invalid) {
          const sh = 2 * dayIdx + 1 - (original.checkInHalfDay ? 1 : 0);
          const eh = 2 * (dayIdx + nights) + 1 + (original.checkOutHalfDay ? 1 : 0);
          if (hasBookingConflict({ roomNumber: rRoom, bedIndex: rBed, status: original.status }, sh, eh, original.id)) {
            invalid = true;
          }
        }
      }
      setMoveGhost((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY, targetRoom, targetBed, targetCheckIn, targetCheckOut, invalid } : prev);
    };

    const onUp = () => {
      const g = moveGhostRef.current;
      setMoveGhost(null);
      if (!g || g.targetRoom == null || !g.targetCheckIn || !g.targetCheckOut) return;
      // No-op when dropped on its own original slot
      if (
        g.targetRoom === original.roomNumber &&
        g.targetBed === original.bedIndex &&
        g.targetCheckIn === original.checkIn &&
        g.targetCheckOut === original.checkOut
      ) return;
      if (g.invalid) { toast.error(t('overlapError')); return; }
      moveResolvedRef.current = false;
      setMoveConfirm({
        booking: original,
        targetRoom: g.targetRoom,
        targetBed: g.targetBed,
        targetCheckIn: g.targetCheckIn,
        targetCheckOut: g.targetCheckOut,
      });
    };

    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoveGhost(null); };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('keydown', onKey);
    };
  }, [moveGhost, today, t, hasBookingConflict]);

  const moveResolvedRef = useRef(false);
  const confirmMove = useCallback(() => {
    if (!moveConfirm) return;
    const { booking, targetRoom, targetBed, targetCheckIn, targetCheckOut } = moveConfirm;
    onUpdateBooking(booking.id, {
      roomNumber: targetRoom,
      bedIndex: targetBed,
      checkIn: targetCheckIn,
      checkOut: targetCheckOut,
    });
    toast.success(lang === 'ru' ? 'Бронирование перемещено' : 'Booking moved');
    moveResolvedRef.current = true;
    setMoveConfirm(null);
  }, [moveConfirm, onUpdateBooking, lang]);

  const cancelMove = useCallback(() => {
    if (moveResolvedRef.current) {
      moveResolvedRef.current = false;
      setMoveConfirm(null);
      return;
    }
    moveResolvedRef.current = true;
    setMoveConfirm(null);
    toast.message(lang === 'ru' ? 'Перемещение отменено' : 'Move cancelled');
  }, [lang]);

  const moveTargetRoomInfo = useMemo(() => {
    if (!moveConfirm) return null;
    const r = rooms.find((x) => x.number === moveConfirm.targetRoom);
    const c = r ? categories.find((cc) => cc.id === r.category) : null;
    return { room: r, category: c };
  }, [moveConfirm, rooms, categories]);

  const handleBookingClick = useCallback((booking: Booking) => {
    setSelectedRoom(booking.roomNumber);
    setSelectedCheckIn(booking.checkIn);
    setSelectedCheckOut(booking.checkOut);
    setSelectedEarlyCheckin(!!booking.checkInHalfDay);
    setSelectedLateCheckout(!!booking.checkOutHalfDay);
    setEditBooking(booking);
    setDialogOpen(true);
  }, []);

  const handleResize = useCallback((id: string, newCheckOut: string, halfDay: boolean) => {
    onUpdateBooking(id, { checkOut: newCheckOut, checkOutHalfDay: halfDay });
  }, [onUpdateBooking]);
  const handleResizeLeft = useCallback((id: string, halfDay: boolean) => {
    onUpdateBooking(id, { checkInHalfDay: halfDay });
  }, [onUpdateBooking]);
  const canResize = useCallback((id: string, newCheckOut: string, halfDay: boolean) => {
    const booking = bookingsRef.current.find((b) => b.id === id);
    if (!booking) return true;
    const span = bookingHalfSpan({ ...booking, checkOut: newCheckOut, checkOutHalfDay: halfDay });
    return !span || !hasBookingConflict(booking, span[0], span[1], id);
  }, [bookingHalfSpan, hasBookingConflict]);
  const canResizeLeft = useCallback((id: string, halfDay: boolean) => {
    const booking = bookingsRef.current.find((b) => b.id === id);
    if (!booking) return true;
    const span = bookingHalfSpan({ ...booking, checkInHalfDay: halfDay });
    return !span || !hasBookingConflict(booking, span[0], span[1], id);
  }, [bookingHalfSpan, hasBookingConflict]);

  const getDayLabel = useCallback((d: Date) => (lang === 'ru' ? DAY_LABELS_RU : DAY_LABELS_UZ)[d.getDay()], [lang]);
  const isTdy = useCallback((d: Date) => isSameDay(d, today), [today]);
  const isPast = useCallback((d: Date) => isBefore(d, today) && !isSameDay(d, today), [today]);
  const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;

  const monthStarts = useMemo(() => {
    const s = new Set<number>();
    dates.forEach((d, i) => { if (d.getDate() === 1) s.add(i); });
    s.add(0);
    return s;
  }, [dates]);

  return (
    <>
      <div className="relative flex-1 min-h-0 flex flex-col">
        <button
          type="button"
          onClick={scrollToToday}
          className="jump-today-btn group absolute top-3 right-5 z-30 inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider text-primary-foreground shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-300"
          title={lang === 'ru' ? 'К сегодняшней дате' : 'Bugungi sanaga'}
        >
          <CalendarCheck2 className="h-3.5 w-3.5 transition-transform duration-500 group-hover:rotate-12" />
          {lang === 'ru' ? 'Сегодня' : 'Bugun'}
        </button>
        <div ref={scrollRef} onScroll={handleScroll} className="timeline-scroll flex-1 overflow-auto select-none" style={{ contain: 'layout paint', willChange: 'scroll-position' }}>
          <div style={{ minWidth: totalWidth + LABEL_WIDTH }}>
            <div
              className="sticky top-0 z-20 flex cursor-grab"
              style={{ borderBottom: '2px solid hsl(var(--grid-line-bold))' }}
              onMouseDown={handleHeaderMouseDown}
            >
              <div className="sticky left-0 z-30 shrink-0 bg-card flex items-center gap-2 px-3"
                style={{ width: LABEL_WIDTH, borderRight: '2px solid hsl(var(--grid-line-bold))', boxShadow: '4px 0 8px hsl(0 0% 0% / 0.06)' }}>
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-foreground">{t('roomCategory')}</span>
                  <span className="text-[9px] text-muted-foreground font-semibold mt-0.5">
                    {lang === 'ru' ? 'Комната / Тип' : lang === 'uz' ? 'Xona / Turi' : 'Room / Type'}
                  </span>
                </div>
                <button
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); setAddCategoryOpen(true); }}
                  title={t('addCategory')}
                  className="add-control-fancy group inline-flex h-9 items-center gap-1.5 rounded-full bg-gradient-to-r from-primary via-primary/90 to-primary/75 px-3 text-[10px] font-black uppercase tracking-wider text-primary-foreground shadow-lg shadow-primary/30 ring-1 ring-primary/40 hover:shadow-xl hover:shadow-primary/40 hover:scale-105 active:scale-95 transition-all"
                >
                  <FolderPlus className="h-3.5 w-3.5 transition-transform duration-300 group-hover:rotate-12" />
                  <span className="hidden xl:inline">{t('addCategory')}</span>
                </button>
              </div>
              <div className="flex">
                {dates.map((d, i) => (
                  <DayHeaderCell key={i} date={d} isToday={isTdy(d)} isPastDay={isPast(d)} isWeekendDay={isWeekend(d)}
                    dayLabel={getDayLabel(d)} lang={lang} isFirstOfMonth={monthStarts.has(i)} />
                ))}
              </div>
            </div>

            {categories.map(cat => {
              const catRooms = rooms.filter(r => r.category === cat.id);
              const isCollapsed = collapsedCategories[cat.id] ?? false;
              const personCount = PERSON_COUNTS[cat.id] ?? cat.maxGuests ?? 0;

              return (
                <div key={cat.id}>
                  <div
                    className="group/category flex cursor-pointer category-header hover:brightness-[1.02] transition-all"
                    style={{ borderTop: '2px solid hsl(var(--grid-line-bold))', borderBottom: '2px solid hsl(var(--primary-hsl) / 0.35)', background: 'linear-gradient(90deg, hsl(var(--primary-hsl) / 0.18) 0%, hsl(var(--primary-hsl) / 0.08) 60%, hsl(var(--primary-hsl) / 0.04) 100%)', height: 48 }}
                    onClick={() => toggleCategory(cat.id)}
                  >
                    <div className="sticky left-0 z-20 shrink-0 flex items-center gap-2.5 px-3 py-2 overflow-visible"
                      style={{ width: LABEL_WIDTH, minWidth: LABEL_WIDTH, borderRight: '2px solid hsl(var(--grid-line-bold))', background: 'linear-gradient(90deg, hsl(var(--primary-hsl) / 0.22), hsl(var(--primary-hsl) / 0.14))', boxShadow: '4px 0 12px hsl(var(--primary-hsl) / 0.12)' }}>
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/25">
                        {isCollapsed ? <ChevronRight className="h-4 w-4 text-primary" /> : <ChevronDown className="h-4 w-4 text-primary" />}
                      </div>
                      <div className="flex flex-col min-w-0 flex-1 overflow-visible">
                        <span className="text-[12px] font-extrabold text-foreground leading-tight block whitespace-normal break-words" title={cat.label[lang]}>
                          {cat.label[lang]}
                        </span>
                        <span className="text-[9px] text-muted-foreground font-semibold flex flex-wrap items-center gap-1 leading-tight">
                          <span className="uppercase tracking-wider text-primary/70 font-bold">{cat.short}</span>
                          <span className="opacity-60">·</span>
                          <span>{catRooms.length} {t('rooms')}</span>
                          {personCount > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-primary/80">
                              · <Users className="inline h-3 w-3" /> {personCount}
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="ml-auto flex shrink-0 items-center gap-1.5">
                        {canEditRate ? (
                          <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); openRateEditor(cat.id); }}
                            title={lang === 'ru' ? 'Цена за ночь' : 'Rate per night'}
                            className="inline-flex h-7 shrink-0 items-center rounded-full bg-emerald-500/12 px-2.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/25 hover:bg-emerald-500 hover:text-white hover:ring-emerald-500 transition-colors"
                          >
                            {lang === 'ru' ? 'Цена' : 'Price'}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => { e.stopPropagation(); setAddRoomCategoryId(cat.id); }}
                          title={t('addRoom')}
                          className="add-control-fancy inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-card/95 text-primary ring-1 ring-primary/30 hover:bg-primary hover:text-primary-foreground transition-colors"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget({ type: 'category', id: cat.id, label: cat.label[lang] }); }}
                          title={lang === 'ru' ? 'Удалить категорию' : 'Delete category'}
                          className="delete-control-fancy flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-card/90 text-destructive ring-1 ring-destructive/20 hover:bg-destructive hover:text-destructive-foreground transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <div style={{ width: totalWidth, height: '100%', position: 'relative' }}>
                      <div
                        style={{ position: 'sticky', left: LABEL_WIDTH + 14, display: 'inline-flex', height: '100%', alignItems: 'center', paddingRight: 14, pointerEvents: 'auto', zIndex: 5 }}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <CategoryStatusStrip counts={categoryStatusCounts[cat.id] ?? { confirmed: 0, pending: 0, booked: 0, 'in-house': 0, 'checked-out': 0, maintenance: 0 }} lang={lang} />
                      </div>
                    </div>
                  </div>

                  {!isCollapsed && catRooms.map((room) => {
                    const isExpanded = expandedRooms[room.number] ?? false;
                    const hasPersonRows = personCount >= 2;
                    const extra = extraPersons[room.number] || 0;
                    const totalPersons = personCount + extra;
                    const bars = buckets.byRoom.get(room.number) || [];
                    const roomKey = `${room.number}`;

                    return (
                      <div key={room.number} className={isExpanded ? 'person-section-expanded' : ''}>
                        <div className={`group/room flex grid-row ${isExpanded ? 'person-section-top-border' : ''}`}
                          style={{ borderBottom: '1px solid hsl(var(--grid-line))' }}>
                          <div className="sticky left-0 z-10 flex shrink-0 items-center gap-2 bg-card px-2.5"
                            style={{ width: LABEL_WIDTH, borderRight: '2px solid hsl(var(--grid-line-bold))', boxShadow: '4px 0 8px hsl(0 0% 0% / 0.04)' }}>
                            {hasPersonRows ? (
                              <button
                                type="button"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => { e.stopPropagation(); e.preventDefault(); toggleRoomExpand(room.number); }}
                                className={`flex h-6 w-6 items-center justify-center rounded-lg transition-all duration-200 ${isExpanded ? 'bg-primary/20 shadow-sm' : 'hover:bg-primary/10'}`}
                                title={lang === 'ru' ? 'Показать кровати' : "Yotoqlarni ko'rsatish"}
                              >
                                <ChevronRight className={`h-3.5 w-3.5 text-primary/70 transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`} />
                              </button>
                            ) : <div className="w-6" />}
                            <div className="flex h-7 w-9 items-center justify-center rounded-lg bg-primary/10 text-[12px] font-black text-primary">
                              {room.number}
                            </div>
                            <div className="flex flex-col min-w-0 flex-1">
                              <span className="text-[10px] font-bold text-foreground leading-tight truncate">{cat.label[lang]}</span>
                              <span className="text-[9px] text-muted-foreground font-semibold truncate">{cat.short}</span>
                            </div>
                            {hasPersonRows && (
                              <button
                                type="button"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => { e.stopPropagation(); e.preventDefault(); addExtraPerson(room.number); }}
                                title={lang === 'ru' ? 'Добавить гостя' : "Mehmon qo'shish"}
                                className="add-control-fancy flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20 hover:bg-primary hover:text-primary-foreground hover:scale-110 active:scale-95 transition-all duration-200 group"
                              >
                                <Plus className="h-3.5 w-3.5 group-hover:rotate-90 transition-transform duration-300" />
                              </button>
                            )}
                            <button
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => { e.stopPropagation(); e.preventDefault(); setDeleteTarget({ type: 'room', roomNumber: room.number }); }}
                              title={lang === 'ru' ? 'Удалить номер' : 'Delete room'}
                              className="delete-control-fancy flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 ring-1 ring-transparent transition-all hover:bg-destructive/15 hover:text-destructive hover:ring-destructive/25 hover:scale-105 active:scale-95"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div
                            className="relative cursor-crosshair"
                            data-grid-row="true"
                            data-room-number={room.number}
                            data-bed-index=""
                            style={{ width: totalWidth, height: ROW_HEIGHT, contain: 'layout paint' }}
                            onMouseDown={(e) => handleCellMouseDown(room.number, undefined, ROW_HEIGHT, e)}
                          >
                            <RowBackground height={ROW_HEIGHT} totalWidth={totalWidth} todayOffset={todayIdx} totalDays={totalDays} />
                            <RowDragOverlay rowKey={roomKey} registerOverlay={registerOverlay} />
                            {bars.map(({ booking, leftPx, widthPx, isPast: bp }) => (
                              <BookingBar
                                key={booking.id}
                                booking={booking}
                                leftPx={leftPx}
                                widthPx={widthPx}
                                onClick={handleBookingClick}
                                dayWidthPx={DAY_WIDTH}
                                isPast={bp}
                                onResize={handleResize}
                                canResize={canResize}
                                onResizeLeft={handleResizeLeft}
                                canResizeLeft={canResizeLeft}
                                onResizeConflict={showOverlapError}
                                onMoveStart={handleBookingMoveStart}
                              />
                            ))}
                          </div>
                        </div>

                        {hasPersonRows && isExpanded && (
                          <div className="person-section-body">
                            {Array.from({ length: totalPersons }, (_, pIdx) => {
                              if (deletedPersonSlots[room.number]?.has(pIdx)) return null;
                              const isExtra = pIdx >= personCount;
                              const personBars = buckets.byBed.get(`${room.number}:${pIdx}`) || [];
                              const bedKey = `${room.number}:${pIdx}`;
                              return (
                                <div key={pIdx} className="group/guest flex person-row-animate person-row-active person-row-hover"
                                  style={{ borderBottom: pIdx < totalPersons - 1 ? '1px solid hsl(var(--grid-line))' : 'none', animationDelay: `${pIdx * 60}ms` }}>
                                  <div className="sticky left-0 z-10 flex shrink-0 items-center gap-2 px-2.5 pl-12"
                                    style={{ width: LABEL_WIDTH, borderRight: '2px solid hsl(var(--grid-line-bold))', background: 'hsl(var(--grid-person-expanded-bg))', boxShadow: '4px 0 8px hsl(0 0% 0% / 0.03)' }}>
                                    <div className={`flex h-5 w-5 items-center justify-center rounded-full ${isExtra ? 'bg-primary/30' : 'bg-primary/20'}`}>
                                      <User className="h-3 w-3 text-primary/70" />
                                    </div>
                                    <input
                                      type="text"
                                      value={personNames[room.number]?.[pIdx] ?? ''}
                                      onChange={(e) => updatePersonName(room.number, pIdx, e.target.value)}
                                      placeholder={`${t('person')} ${pIdx + 1}`}
                                      className="person-name-input text-[10px] font-bold text-muted-foreground/80 bg-transparent border-none outline-none flex-1 min-w-0 placeholder:text-muted-foreground/50 focus:text-foreground h-6 px-1.5 rounded-md transition-all duration-200 hover:bg-primary/5"
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                    <button
                                      type="button"
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onClick={(e) => { e.stopPropagation(); setDeleteTarget({ type: 'guest', roomNumber: room.number, personIdx: pIdx, isExtra }); }}
                                      title={lang === 'ru' ? 'Удалить гостя' : "Mehmonni olib tashlash"}
                                      className="delete-control-fancy flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 ring-1 ring-transparent transition-all hover:bg-destructive/15 hover:text-destructive hover:ring-destructive/25 hover:scale-105 active:scale-95"
                                    >
                                      {isExtra ? <X className="h-3 w-3" /> : <Trash2 className="h-3 w-3" />}
                                    </button>
                                  </div>
                                  <div
                                    className="relative cursor-crosshair"
                                    data-grid-row="true"
                                    data-room-number={room.number}
                                    data-bed-index={pIdx}
                                    style={{ width: totalWidth, height: PERSON_ROW_HEIGHT, contain: 'layout paint' }}
                                    onMouseDown={(e) => handleCellMouseDown(room.number, pIdx, PERSON_ROW_HEIGHT, e)}
                                  >
                                    <RowBackground height={PERSON_ROW_HEIGHT} totalWidth={totalWidth} todayOffset={todayIdx} totalDays={totalDays} />
                                    <RowDragOverlay rowKey={bedKey} registerOverlay={registerOverlay} />
                                    {personBars.map(({ booking, leftPx, widthPx, isPast: bp }) => (
                                      <BookingBar
                                        key={booking.id}
                                        booking={booking}
                                        leftPx={leftPx}
                                        widthPx={widthPx}
                                        onClick={handleBookingClick}
                                        dayWidthPx={DAY_WIDTH}
                                        isPast={bp}
                                        onResize={handleResize}
                                        canResize={canResize}
                                        onResizeLeft={handleResizeLeft}
                                        canResizeLeft={canResizeLeft}
                                        onResizeConflict={showOverlapError}
                                        onMoveStart={handleBookingMoveStart}
                                      />
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <BookingDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditBooking(null); setSelectedBedIndex(undefined); setSelectedPrefillName(''); setSelectedEarlyCheckin(false); setSelectedLateCheckout(false); }}
        onSave={onAddBooking}
        onUpdate={onUpdateBooking}
        onDelete={onDeleteBooking}
        roomNumber={selectedRoom}
        checkIn={selectedCheckIn}
        checkOut={selectedCheckOut}
        editBooking={editBooking}
        bedIndex={selectedBedIndex}
        prefillName={selectedPrefillName}
        initialEarlyCheckin={selectedEarlyCheckin}
        initialLateCheckout={selectedLateCheckout}
      />

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="overflow-hidden rounded-2xl border-2 border-destructive/25 bg-card p-0 shadow-2xl">
          <div className="relative p-6">
            <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_20%_0%,hsl(var(--destructive)/0.16),transparent_38%),linear-gradient(135deg,hsl(var(--destructive)/0.08),transparent_52%)]" />
            <AlertDialogHeader className="relative gap-3 text-left">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/12 text-destructive ring-1 ring-destructive/25">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <AlertDialogTitle className="font-display text-xl font-black">
                {lang === 'ru' ? 'Вы уверены?' : 'Are you sure?'}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm font-medium leading-relaxed">
                {lang === 'ru'
                  ? 'После подтверждения выбранный элемент будет скрыт из сетки. Это действие нельзя отменить в этом окне.'
                  : 'After confirmation, the selected item will be hidden from the grid. This action cannot be undone here.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="relative mt-6 gap-2 sm:space-x-0">
              <AlertDialogCancel className="rounded-xl border-border/70 bg-background/80 font-bold">
                {t('cancel')}
              </AlertDialogCancel>
              <AlertDialogAction onClick={confirmDelete} className="rounded-xl bg-destructive font-black text-destructive-foreground shadow-lg shadow-destructive/25 hover:bg-destructive/90">
                {t('delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={rateEditCategoryId !== null} onOpenChange={(open) => !open && setRateEditCategoryId(null)}>
        <AlertDialogContent className="overflow-hidden rounded-2xl border-2 border-primary/20 bg-card p-0 shadow-2xl">
          <div className="relative p-6">
            <AlertDialogHeader className="text-left">
              <AlertDialogTitle className="font-display text-xl font-black">
                {lang === 'ru' ? 'Цена категории' : 'Category price'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {categories.find((c) => c.id === rateEditCategoryId)?.label[lang] ?? ''}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="mt-5 flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2">
              <span className="text-sm font-black text-emerald-500">сум</span>
              <input
                autoFocus
                type="number"
                min={0}
                step="1"
                value={rateDraft}
                onChange={(e) => setRateDraft(e.target.value)}
                className="h-10 flex-1 bg-transparent text-lg font-black tabular-nums text-foreground outline-none"
                placeholder="0"
              />
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">UZS</span>
            </div>
            <AlertDialogFooter className="mt-6 gap-2 sm:space-x-0">
              <AlertDialogCancel className="rounded-xl border-border/70 bg-background/80 font-bold">
                {t('cancel')}
              </AlertDialogCancel>
              <AlertDialogAction onClick={saveRate} className="rounded-xl bg-primary font-black text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90">
                <Check className="mr-1.5 h-4 w-4" /> {t('save')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <AddCategoryDialog open={addCategoryOpen} onClose={() => setAddCategoryOpen(false)} />
      <AddRoomDialog
        open={addRoomCategoryId !== null}
        onClose={() => setAddRoomCategoryId(null)}
        category={categories.find((c) => c.id === addRoomCategoryId) ?? null}
      />

      {/* Drag-to-move ghost overlay */}
      {moveGhost && typeof document !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed',
            left: moveGhost.x - moveGhost.offsetX,
            top: moveGhost.y - moveGhost.offsetY,
            width: moveGhost.width,
            height: moveGhost.height,
            pointerEvents: 'none',
            zIndex: 9999,
            borderRadius: 12,
            background: moveGhost.invalid
              ? 'linear-gradient(135deg, hsl(var(--destructive) / 0.85), hsl(var(--destructive) / 0.65))'
              : 'linear-gradient(135deg, hsl(var(--primary-hsl) / 0.85), hsl(var(--primary-hsl) / 0.6))',
            color: 'hsl(var(--primary-foreground))',
            border: moveGhost.invalid
              ? '2px solid hsl(var(--destructive))'
              : '2px solid hsl(var(--primary-hsl))',
            boxShadow: moveGhost.invalid
              ? '0 18px 40px -10px hsl(var(--destructive) / 0.55), 0 0 0 4px hsl(var(--destructive) / 0.18)'
              : '0 18px 40px -10px hsl(var(--primary-hsl) / 0.55), 0 0 0 4px hsl(var(--primary-hsl) / 0.18)',
            transform: 'scale(1.04) rotate(-0.6deg)',
            transition: 'background 120ms ease, border-color 120ms ease, box-shadow 160ms ease',
            display: 'flex',
            alignItems: 'center',
            padding: '0 12px',
            fontSize: 12,
            fontWeight: 700,
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            backdropFilter: 'blur(2px)',
          }}
        >
          <span style={{ opacity: 0.95, textOverflow: 'ellipsis', overflow: 'hidden' }}>
            {moveGhost.invalid
              ? (lang === 'ru' ? '✕ Невозможно разместить здесь' : '✕ Cannot drop here')
              : `↕ ${(moveGhost.booking.guestName || '').trim() || (lang === 'ru' ? 'Бронирование' : 'Booking')}`}
            {!moveGhost.invalid && moveGhost.targetCheckIn && (
              <span style={{ marginLeft: 8, opacity: 0.8, fontWeight: 600 }}>
                → {format(parseISO(moveGhost.targetCheckIn), 'dd MMM')}
                {moveGhost.targetRoom != null && ` · #${moveGhost.targetRoom}`}
              </span>
            )}
          </span>
        </div>,
        document.body,
      )}

      {/* Move confirmation dialog */}
      <AlertDialog open={moveConfirm !== null} onOpenChange={(open) => { if (!open && moveConfirm) cancelMove(); }}>
        <AlertDialogContent className="overflow-hidden rounded-2xl border-2 border-primary/25 bg-card p-0 shadow-2xl">
          <div className="relative p-6">
            <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_20%_0%,hsl(var(--primary-hsl)/0.16),transparent_38%),linear-gradient(135deg,hsl(var(--primary-hsl)/0.08),transparent_52%)]" />
            <AlertDialogHeader className="relative gap-3 text-left">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/25">
                <CalendarCheck2 className="h-6 w-6" />
              </div>
              <AlertDialogTitle className="font-display text-xl font-black">
                {lang === 'ru' ? 'Переместить бронирование?' : 'Move booking?'}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm font-medium leading-relaxed">
                {moveConfirm && (
                  <>
                    {lang === 'ru' ? 'Гость: ' : 'Guest: '}
                    <span className="font-bold text-foreground">{moveConfirm.booking.guestName || '—'}</span>
                    <br />
                    <span className="text-muted-foreground">
                      {lang === 'ru' ? 'Из' : 'From'}: #{moveConfirm.booking.roomNumber}
                      {moveConfirm.booking.bedIndex !== undefined && ` · ${lang === 'ru' ? 'место' : 'bed'} ${moveConfirm.booking.bedIndex + 1}`}
                      {' · '}{moveConfirm.booking.checkIn} → {moveConfirm.booking.checkOut}
                    </span>
                    <br />
                    <span className="text-primary font-bold">
                      {lang === 'ru' ? 'В' : 'To'}: #{moveConfirm.targetRoom}
                      {moveConfirm.targetBed !== undefined && ` · ${lang === 'ru' ? 'место' : 'bed'} ${moveConfirm.targetBed + 1}`}
                      {moveTargetRoomInfo?.category && ` · ${moveTargetRoomInfo.category.label[lang]}`}
                      {' · '}{moveConfirm.targetCheckIn} → {moveConfirm.targetCheckOut}
                    </span>
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="relative mt-6 gap-2 sm:space-x-0">
              <AlertDialogCancel onClick={cancelMove} className="rounded-xl border-border/70 bg-background/80 font-bold">
                {lang === 'ru' ? 'Нет, вернуть' : 'No, snap back'}
              </AlertDialogCancel>
              <AlertDialogAction onClick={confirmMove} className="rounded-xl bg-primary font-black text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90">
                <Check className="mr-1.5 h-4 w-4" />
                {lang === 'ru' ? 'Да, переместить' : 'Yes, move'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
