import { useMemo } from 'react';
import { type Room, type Booking, type BookingStatus, BOOKING_STATUSES, formatGuestName } from '@/types/hotel';
import { useI18n } from '@/hooks/useI18n';
import { useHotelGrid } from '@/hooks/HotelGridContext';
import { parseISO, isWithinInterval, startOfDay } from 'date-fns';
import { Pencil, CalendarDays, Users, CalendarRange } from 'lucide-react';

interface RoomTileGridProps {
  rooms: Room[]; bookings: Booking[]; activeFilter: BookingStatus | 'all' | 'available';
  selectedDate: Date; onEditRoom: (roomNumber: number) => void;
  /** When provided, a "View on grid" button is rendered on tiles that have a booking. */
  onShowOnGrid?: (bookingId: string) => void;
}

function getRoomBooking(roomNumber: number, bookings: Booking[], date: Date): Booking | null {
  const d = startOfDay(date);
  return bookings.find(b => {
    if (b.roomNumber !== roomNumber) return false;
    return isWithinInterval(d, { start: parseISO(b.checkIn), end: parseISO(b.checkOut) });
  }) || null;
}

export function HotelRoomTileGrid({ rooms, bookings, activeFilter, selectedDate, onEditRoom, onShowOnGrid }: RoomTileGridProps) {
  const { lang, t } = useI18n();
  const { categories } = useHotelGrid();

  const roomData = useMemo(() => rooms.map(r => ({ room: r, booking: getRoomBooking(r.number, bookings, selectedDate) })), [rooms, bookings, selectedDate]);
  const matches = (booking: Booking | null) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'available') return booking === null;
    return booking?.status === activeFilter;
  };

  const getCategoryLabel = (catId: string) => {
    const cat = categories.find(c => c.id === catId);
    return cat ? (cat.label[lang] || cat.short) : catId;
  };

  // Group rooms by category, preserving the order from `categories`.
  const grouped = useMemo(() => {
    const map = new Map<string, typeof roomData>();
    categories.forEach(c => map.set(c.id, []));
    roomData.forEach(rd => {
      if (!map.has(rd.room.category)) map.set(rd.room.category, []);
      map.get(rd.room.category)!.push(rd);
    });
    return Array.from(map.entries()).filter(([, items]) => items.length > 0);
  }, [roomData, categories]);

  const renderTile = ({ room, booking }: { room: Room; booking: Booking | null }) => {
    const statusCfg = booking ? BOOKING_STATUSES[booking.status] : null;
    const isMatch = matches(booking);
    return (
      <div
        key={room.number}
        className={`room-card relative p-4 cursor-pointer overflow-hidden group transition-all duration-200 hover:bg-accent/40 ${isMatch ? '' : 'opacity-30 grayscale hover:opacity-60'}`}
        style={{ contain: 'layout paint' }}
        onClick={() => onEditRoom(room.number)}
      >
        <div className="flex items-start justify-between mb-1.5">
          <span className="text-2xl font-black text-foreground leading-none group-hover:text-primary transition-colors duration-150">{room.number}</span>
          <button
            onClick={(e) => { e.stopPropagation(); onEditRoom(room.number); }}
            className="p-1.5 rounded-lg hover:bg-muted transition-opacity duration-150 opacity-0 group-hover:opacity-100"
          >
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
        <p className="text-[11px] font-medium text-muted-foreground mb-3">{getCategoryLabel(room.category)}</p>

        {statusCfg ? (
          <div>
            <div className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${statusCfg.tailwindBg} ${statusCfg.tailwindText} ${statusCfg.tailwindBorder} border`}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: statusCfg.color }} />
              {statusCfg.label[lang]}
            </div>
            {booking && (booking.guestName || booking.guestFirstName || booking.guestLastName) && (
              <div className="mt-2 space-y-1">
                <p className="text-sm font-normal text-foreground truncate">{formatGuestName(booking)}</p>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <CalendarDays className="h-3 w-3" />
                  <span>{booking.checkIn} → {booking.checkOut}</span>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Users className="h-3 w-3" />
                  <span>{booking.guestCount}</span>
                </div>
              </div>
            )}
            {booking && onShowOnGrid && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onShowOnGrid(booking.id); }}
                className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary/10 hover:bg-primary hover:text-primary-foreground text-primary text-[10px] font-bold uppercase tracking-wide px-2 py-1.5 ring-1 ring-primary/20 transition-all duration-200 hover:scale-[1.03]"
                title={t('viewOnGrid')}
              >
                <CalendarRange className="h-3 w-3" />
                {t('viewOnGrid')}
              </button>
            )}
          </div>
        ) : (
          <div className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {t('available')}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4 px-4 pb-4">
      {grouped.map(([catId, items]) => {
        const cat = categories.find(c => c.id === catId);
        const label = cat ? (cat.label[lang] || cat.short) : catId;
        const short = cat?.short ?? '';
        return (
          <section
            key={catId}
            className="rounded-2xl border border-border bg-card/60 backdrop-blur-sm shadow-sm overflow-hidden"
          >
            <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-muted/40">
              <div className="flex items-baseline gap-2 min-w-0">
                <h3 className="text-sm font-bold text-foreground truncate">{label}</h3>
                {short && <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{short}</span>}
              </div>
              <span className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-2 rounded-full bg-primary/10 text-primary text-[11px] font-bold">
                {items.length}
              </span>
            </header>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 p-3">
              {items.map(renderTile)}
            </div>
          </section>
        );
      })}
    </div>
  );
}
