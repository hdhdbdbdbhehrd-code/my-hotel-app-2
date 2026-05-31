import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { type Booking, type BookingStatus, BOOKING_STATUSES } from '@/types/hotel';
import {
  UserPlus, Edit, Trash2, Clock, CalendarDays, Users, Phone, Mail, StickyNote,
  MessageCircle, Send, Instagram, ClipboardSignature, Sparkles, ArrowRight,
  Sunrise, Moon, X, BedDouble, Check, DollarSign,
} from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { toast } from 'sonner';
import { differenceInCalendarDays, parseISO, format, addDays, isBefore, startOfDay } from 'date-fns';
import { HotelGuestAnketaModal } from './HotelGuestAnketaModal';
import { GuestDetailsWindow } from './GuestDetailsWindow';
import { DeleteBookingModal } from './DeleteBookingModal';
import { HotelDatePicker } from './HotelDatePicker';
import { useAuth } from '@/contexts/AuthContext';
import { useHotelGrid } from '@/hooks/HotelGridContext';
import { ChevronDown } from 'lucide-react';


const nextDay = (iso: string) => format(addDays(parseISO(iso), 1), 'yyyy-MM-dd');
const prevDay = (iso: string) => format(addDays(parseISO(iso), -1), 'yyyy-MM-dd');

interface BookingDialogProps {
  open: boolean; onClose: () => void;
  onSave: (booking: Booking) => boolean | void;
  onUpdate?: (id: string, updates: Partial<Booking>) => boolean | void;
  onDelete?: (id: string) => void;
  roomNumber: number; checkIn: string; checkOut: string;
  editBooking?: Booking | null;
  bedIndex?: number;
  prefillName?: string;
  initialEarlyCheckin?: boolean;
  initialLateCheckout?: boolean;
}

export function BookingDialog({
  open, onClose, onSave, onUpdate, onDelete, roomNumber, checkIn, checkOut, editBooking, bedIndex, prefillName,
  initialEarlyCheckin = false, initialLateCheckout = false,
}: BookingDialogProps) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { rooms, categories, categoryRates, setCategoryRate } = useHotelGrid();
  const isAdminOnly = user?.role === 'admin';
  const isManagerOnly = user?.role === 'manager';
  const roomCategoryId = useMemo(() => rooms.find(r => r.number === roomNumber)?.category, [rooms, roomNumber]);
  const categoryRate = roomCategoryId ? (categoryRates[roomCategoryId] ?? 0) : 0;
  const categoryLabel = useMemo(() => {
    const c = categories.find(c => c.id === roomCategoryId);
    return c ? c.label[lang] || c.label.en : '';
  }, [categories, roomCategoryId, lang]);
  const [managerRateInput, setManagerRateInput] = useState('');
  useEffect(() => {
    if (isManagerOnly) setManagerRateInput(categoryRate ? String(categoryRate) : '');
  }, [isManagerOnly, categoryRate, open]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestWhatsapp, setGuestWhatsapp] = useState('');
  const [guestTelegram, setGuestTelegram] = useState('');
  const [guestInstagram, setGuestInstagram] = useState('');
  const [guestCount, setGuestCount] = useState(1);
  const [notes, setNotes] = useState('');
  const [inDate, setInDate] = useState(checkIn);
  const [outDate, setOutDate] = useState(checkOut);
  const [status, setStatus] = useState<BookingStatus>('confirmed');
  const [earlyCheckin, setEarlyCheckin] = useState(false);
  const [lateCheckout, setLateCheckout] = useState(false);
  const [price, setPrice] = useState('');
  const lastNameRef = useRef<HTMLInputElement | null>(null);
  const [surnameGlow, setSurnameGlow] = useState(false);
  useEffect(() => {
    if (!open) { setSurnameGlow(false); return; }
    const focusTimer = setTimeout(() => {
      lastNameRef.current?.focus();
      setSurnameGlow(true);
    }, 180);
    const offTimer = setTimeout(() => setSurnameGlow(false), 1600);
    return () => { clearTimeout(focusTimer); clearTimeout(offTimer); };
  }, [open]);
  const [anketaOpen, setAnketaOpen] = useState(false);
  const [guestDetailsOpen, setGuestDetailsOpen] = useState(false);
  const isCheckedOut = editBooking?.status === 'checked-out';

  useEffect(() => {
    if (editBooking) {
      // Prefer structured name fields (source of truth). Fall back to splitting
      // the legacy denormalized `guestName` ONLY for bookings created before
      // the split — and even then we put everything into firstName so we don't
      // silently scatter user input across surname/middle name.
      const hasStructured =
        editBooking.guestLastName !== undefined ||
        editBooking.guestFirstName !== undefined ||
        editBooking.guestMiddleName !== undefined;
      if (hasStructured) {
        setLastName(editBooking.guestLastName || '');
        setFirstName(editBooking.guestFirstName || '');
        setMiddleName(editBooking.guestMiddleName || '');
      } else {
        const raw = (editBooking.guestName || '').trim();
        setLastName('');
        setFirstName(raw);
        setMiddleName('');
      }
      setGuestPhone(editBooking.guestPhone);
      setGuestEmail(editBooking.guestEmail);
      setGuestWhatsapp(editBooking.guestWhatsapp || '');
      setGuestTelegram(editBooking.guestTelegram || '');
      setGuestInstagram(editBooking.guestInstagram || '');
      setGuestCount(editBooking.guestCount);
      setNotes(editBooking.notes);
      setInDate(editBooking.checkIn);
      setOutDate(editBooking.checkOut);
      setStatus(editBooking.status);
      setEarlyCheckin(!!editBooking.checkInHalfDay);
      setLateCheckout(!!editBooking.checkOutHalfDay);
      setPrice(editBooking.price !== undefined ? String(editBooking.price) : '');
    } else {
      // For new bookings, drop the prefill into firstName as a single token —
      // never split by spaces (would corrupt multi-word names like "baxtiyor ogli").
      setFirstName((prefillName || '').trim());
      setMiddleName('');
      setLastName('');
      setGuestPhone(''); setGuestEmail('');
      setGuestWhatsapp(''); setGuestTelegram(''); setGuestInstagram('');
      setGuestCount(1); setNotes(''); setInDate(checkIn); setOutDate(checkOut); setStatus('confirmed');
      setEarlyCheckin(initialEarlyCheckin);
      setLateCheckout(initialLateCheckout);
      setPrice('');
    }
  }, [editBooking, checkIn, checkOut, open, prefillName, initialEarlyCheckin, initialLateCheckout]);

  const dayDiff = inDate && outDate ? differenceInCalendarDays(parseISO(outDate), parseISO(inDate)) : 0;
  const todayISO = format(startOfDay(new Date()), 'yyyy-MM-dd');
  const minCheckIn = editBooking ? undefined : todayISO;
  const halfAdj = (earlyCheckin ? 0.5 : 0) + (lateCheckout ? 0.5 : 0);
  const nightsDisplay = dayDiff + halfAdj;
  const checkInTime = earlyCheckin ? '08:00' : '14:00';
  const checkOutTime = lateCheckout ? '24:00' : '12:00';

  const fullName = useMemo(
    () => [lastName.trim(), firstName.trim(), middleName.trim()].filter(Boolean).join(' '),
    [lastName, firstName, middleName],
  );
  const initials = useMemo(() => {
    const a = (firstName.trim()[0] || '').toUpperCase();
    const b = (lastName.trim()[0] || '').toUpperCase();
    return (a + b) || (a || '•');
  }, [firstName, lastName]);

  const handleSave = (statusOverride?: BookingStatus) => {
    if (!fullName || !inDate || !outDate) return;
    if (dayDiff <= 0) {
      toast.error(lang === 'ru' ? 'Дата выезда должна быть позже даты заезда' : "Chiqish sanasi kirish sanasidan keyin bo'lishi kerak");
      return;
    }
    if (!editBooking && isBefore(parseISO(inDate), startOfDay(new Date()))) {
      toast.error(t('pastBookingError'));
      return;
    }
    const finalStatus = statusOverride ?? status;
    const nameFields = {
      guestLastName: lastName.trim(),
      guestFirstName: firstName.trim(),
      guestMiddleName: middleName.trim(),
    };
    const parsedPrice = Number(price);
    const manualPrice = price.trim() && Number.isFinite(parsedPrice) ? Math.max(0, parsedPrice) : undefined;
    // Admin auto-calculates from the current category rate, but only for NEW bookings.
    // Existing bookings keep their snapshotted price so a later manager rate change
    // does not retroactively rewrite past/current bookings.
    const adminTotal = categoryRate > 0 ? Math.round(nightsDisplay * categoryRate) : undefined;
    const cleanPrice = isAdminOnly
      ? (editBooking?.price !== undefined ? editBooking.price : adminTotal)
      : isManagerOnly
        ? (editBooking?.price)
        : manualPrice;
    if (editBooking && onUpdate) {
      const ok = onUpdate(editBooking.id, {
        guestName: fullName, ...nameFields,
        guestPhone, guestEmail, guestWhatsapp, guestTelegram, guestInstagram,
        guestCount, checkIn: inDate, checkOut: outDate, notes, status: finalStatus,
        checkInHalfDay: earlyCheckin, checkOutHalfDay: lateCheckout, price: cleanPrice,
      });
      if (ok === false) return;
    } else {
      const ok = onSave({
        id: crypto.randomUUID(), roomNumber, guestName: fullName, ...nameFields,
        guestPhone, guestEmail,
        guestWhatsapp, guestTelegram, guestInstagram, guestCount,
        checkIn: inDate, checkOut: outDate, notes, status: finalStatus, price: cleanPrice,
        createdAt: new Date().toISOString(),
        ...(bedIndex !== undefined ? { bedIndex } : {}),
        ...(earlyCheckin ? { checkInHalfDay: true } : {}),
        ...(lateCheckout ? { checkOutHalfDay: true } : {}),
      });
      if (ok === false) return;
    }
    toast.success(t('bookingSaved'));
    onClose();
  };


  const handleDelete = () => {
    if (!editBooking) return;
    setDeleteOpen(true);
  };

  const isEditing = !!editBooking;
  const statusCfg = BOOKING_STATUSES[status];
  const titleLabel = isEditing ? t('editBooking') : t('newBooking');

  // Pretty human date strings for the hero
  const inHuman = inDate ? safeFormat(inDate, 'EEE, d MMM') : '';
  const outHuman = outDate ? safeFormat(outDate, 'EEE, d MMM') : '';
  const guestDetails = {
    bookingId: editBooking?.id,
    fullName,
    initials,
    roomNumber,
    bedIndex,
    statusLabel: statusCfg.label[lang],
    statusColor: statusCfg.color,
    guestLastName: lastName,
    guestFirstName: firstName,
    guestMiddleName: middleName,
    guestPhone,
    guestEmail,
    guestWhatsapp,
    guestTelegram,
    guestInstagram,
    guestCount,
    inHuman,
    outHuman,
    nightsDisplay,
    checkInTime,
    checkOutTime,
    notes,
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="sm:max-w-[940px] w-[calc(100vw-1.5rem)] max-h-[calc(100dvh-1.5rem)] overflow-hidden p-0 border-0 bg-transparent shadow-none [&>button.absolute]:hidden"
      >
        <VisuallyHidden>
          <DialogTitle>Booking</DialogTitle>
          <DialogDescription>Create or edit a booking</DialogDescription>
        </VisuallyHidden>
        <motion.div
          initial={{ opacity: 0, scale: 0.96, filter: 'blur(2px)' }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative flex max-h-[calc(100dvh-1.5rem)] min-h-0 flex-col overflow-hidden rounded-[28px] bg-card ring-1 ring-foreground/10 shadow-[0_50px_120px_-30px_rgba(15,15,40,0.55)]"
        >
          {/* ─────── HERO ─────── */}
          <div className="relative overflow-hidden">
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background: `radial-gradient(120% 140% at 0% 0%, ${statusCfg.color}26 0%, transparent 55%),
                             radial-gradient(120% 140% at 100% 0%, hsl(var(--primary) / 0.18) 0%, transparent 55%),
                             linear-gradient(180deg, hsl(var(--primary) / 0.06), transparent)`,
              }}
            />
            <div aria-hidden className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
            <div aria-hidden className="absolute -left-20 top-10 h-48 w-48 rounded-full blur-3xl" style={{ background: `${statusCfg.color}33` }} />

            <div className="relative px-6 pt-3 pb-3">
              <div className="flex items-start gap-3">
                {/* Initials avatar */}
                <div
                  className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[13px] font-black tracking-tight text-primary-foreground shadow-md shadow-primary/30"
                  style={{ background: `linear-gradient(135deg, hsl(var(--primary)) 0%, ${statusCfg.color} 100%)` }}
                >
                  <span className="drop-shadow-sm">{initials}</span>
                  <span
                    className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-card ring-2 ring-card text-[9px]"
                    title={statusCfg.label[lang]}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: statusCfg.color }} />
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-black uppercase tracking-[0.22em] text-primary/80">
                    {titleLabel}
                  </p>
                  <h2 className="font-display mt-0.5 truncate text-[16px] font-black leading-tight text-foreground">
                    {fullName || (lang === 'ru' ? 'Новый гость' : lang === 'uz' ? 'Yangi mehmon' : 'New guest')}
                  </h2>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px] font-semibold text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-background/70 px-2.5 py-1 ring-1 ring-border/60 backdrop-blur">
                      <BedDouble className="h-3 w-3 text-primary" />
                      {t('room')} {roomNumber}
                      {bedIndex !== undefined && (
                        <span className="ml-1 rounded-md bg-primary/15 px-1.5 py-px text-[9px] font-black uppercase text-primary">
                          #{bedIndex + 1}
                        </span>
                      )}
                    </span>
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ring-1 backdrop-blur"
                      style={{
                        background: `${statusCfg.color}1f`,
                        color: statusCfg.color,
                        borderColor: `${statusCfg.color}40`,
                      }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: statusCfg.color }} />
                      {statusCfg.label[lang]}
                    </span>
                    {dayDiff > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/12 px-2.5 py-1 font-black uppercase tracking-wider text-primary ring-1 ring-primary/25">
                        {Number.isInteger(nightsDisplay) ? nightsDisplay : nightsDisplay.toFixed(1)} {t('nightsShort')}
                      </span>
                    )}
                    {(earlyCheckin || lateCheckout) && (
                      <>
                        {earlyCheckin && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-700 ring-1 ring-emerald-500/30">
                            <Sunrise className="h-3 w-3" /> {t('earlyBadge')}
                          </span>
                        )}
                        {lateCheckout && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-amber-700 ring-1 ring-amber-500/30">
                            <Moon className="h-3 w-3" /> {t('lateBadge')}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  {(inHuman || outHuman) && (
                    <div className="mt-2 flex items-center gap-2 text-[12px] font-semibold tabular-nums text-foreground/80">
                      <span>{inHuman} <span className="text-muted-foreground/70">· {checkInTime}</span></span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground/60" />
                      <span>{outHuman} <span className="text-muted-foreground/70">· {checkOutTime}</span></span>
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={onClose}
                    aria-label="Close"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground backdrop-blur transition hover:border-destructive/40 hover:text-destructive hover:rotate-90"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
            <div className="h-px w-full bg-gradient-to-r from-transparent via-border to-transparent" />
          </div>

          {/* ─────── BODY ─────── */}
          <div className="relative min-h-0 flex-1 overflow-y-auto px-7 py-5 space-y-5">




            {/* 1. GUEST IDENTITY — top */}
            <Section
              icon={<UserPlus className="h-3.5 w-3.5" />}
              label={lang === 'ru' ? 'ФИО гостя' : lang === 'uz' ? 'Mehmon F.I.O.' : 'Guest full name'}
              accent={statusCfg.color}
            >
              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
                <Field label={t('lastName')}>
                  <Input ref={lastNameRef} value={lastName} onChange={e => setLastName(e.target.value)} placeholder={t('lastNamePlaceholder')} className={`h-11 rounded-xl bg-background text-sm font-semibold transition-all duration-500 ${surnameGlow ? 'ring-2 ring-primary/70 shadow-[0_0_0_4px_hsl(var(--primary-hsl)/0.18),0_0_24px_hsl(var(--primary-hsl)/0.45)]' : ''}`} />
                </Field>
                <Field label={t('firstName')} required>
                  <Input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder={t('firstNamePlaceholder')} className="h-11 rounded-xl bg-background text-sm font-semibold" />
                </Field>
                <Field label={t('middleName')}>
                  <Input value={middleName} onChange={e => setMiddleName(e.target.value)} placeholder={t('middleNamePlaceholder')} className="h-11 rounded-xl bg-background text-sm font-semibold" />
                </Field>
              </div>
            </Section>

            {/* 2. STAY WINDOW (full width) — combines period + timing boxes */}
            <Section
              icon={<CalendarDays className="h-3.5 w-3.5" />}
              label={lang === 'ru' ? 'Период проживания' : lang === 'uz' ? 'Yashash davri' : 'Stay window'}
              accent={statusCfg.color}
              right={
                <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
                  {`${checkInTime} → ${checkOutTime}`}
                </span>
              }
            >
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
                  <DateField
                    label={t('checkIn')}
                    accent="emerald"
                    value={inDate}
                    min={minCheckIn}
                    onChange={(v) => { setInDate(v); if (v && outDate && parseISO(outDate) <= parseISO(v)) setOutDate(nextDay(v)); }}
                  />
                  <DateField
                    label={t('checkOut')}
                    accent="rose"
                    value={outDate}
                    min={inDate ? nextDay(inDate) : todayISO}
                    onChange={(v) => { setOutDate(v); if (v && inDate && parseISO(v) <= parseISO(inDate)) setInDate(prevDay(v)); }}
                  />
                  <Field label={t('guests')} icon={<Users className="h-3 w-3 text-primary/70" />}>
                    <Input
                      type="number" min={1} max={10}
                      value={guestCount}
                      onChange={e => setGuestCount(Number(e.target.value))}
                      className="h-10 rounded-xl bg-background tabular-nums"
                    />
                  </Field>
                  {isAdminOnly ? (
                    <Field
                      label={lang === 'ru' ? 'Итого к оплате' : lang === 'uz' ? "To'lov jami" : 'Total to pay'}
                      icon={<DollarSign className="h-3 w-3 text-emerald-500" />}
                    >
                      {(() => {
                        // Existing bookings keep their snapshotted price; only NEW bookings
                        // get the live category rate applied. This means a manager rate
                        // change does not retroactively rewrite past or current bookings.
                        const lockedTotal = editBooking?.price;
                        const liveTotal = Math.round(nightsDisplay * categoryRate);
                        const total = lockedTotal !== undefined ? lockedTotal : liveTotal;
                        const isLocked = lockedTotal !== undefined;
                        return (
                          <div className="relative h-10 rounded-xl border border-emerald-200/60 dark:border-emerald-900/50 bg-gradient-to-br from-emerald-50/80 via-background to-emerald-50/40 dark:from-emerald-950/40 dark:via-background dark:to-emerald-950/20 px-3 flex items-center justify-between overflow-hidden group">
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-emerald-300/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                            <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-600/80 dark:text-emerald-400/80 tabular-nums">
                              {isLocked
                                ? (lang === 'ru' ? 'зафиксировано' : lang === 'uz' ? 'qotirilgan' : 'locked')
                                : `${nightsDisplay} × ${categoryRate.toLocaleString()}`}
                            </span>
                            <span className="font-bold text-sm text-emerald-700 dark:text-emerald-300 tabular-nums">
                              {Number(total || 0).toLocaleString()}
                            </span>
                          </div>
                        );
                      })()}
                    </Field>
                  ) : isManagerOnly ? (
                    <Field
                      label={lang === 'ru' ? `Цена/ночь · ${categoryLabel}` : lang === 'uz' ? `Narx/kecha · ${categoryLabel}` : `Rate/night · ${categoryLabel}`}
                      icon={<DollarSign className="h-3 w-3 text-emerald-500" />}
                    >
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={managerRateInput}
                        onChange={e => {
                          setManagerRateInput(e.target.value);
                          const n = Number(e.target.value);
                          if (roomCategoryId && Number.isFinite(n)) setCategoryRate(roomCategoryId, Math.max(0, n));
                        }}
                        placeholder="0"
                        className="h-10 rounded-xl bg-background tabular-nums"
                      />
                    </Field>
                  ) : (
                    <Field label={lang === 'ru' ? 'Цена' : lang === 'uz' ? 'Narx' : 'Price'} icon={<DollarSign className="h-3 w-3 text-emerald-500" />}>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={price}
                        onChange={e => setPrice(e.target.value)}
                        placeholder="0"
                        className="h-10 rounded-xl bg-background tabular-nums"
                      />
                    </Field>
                  )}
                </div>

                {!isAdminOnly && (
                  <Field label={t('status')} icon={<span className="h-2 w-2 rounded-full" style={{ background: statusCfg.color }} />}>
                    <Select value={status} onValueChange={(v) => setStatus(v as BookingStatus)}>
                      <SelectTrigger className="h-10 rounded-xl bg-background"><SelectValue /></SelectTrigger>
                      <SelectContent className="rounded-xl">
                        {(Object.entries(BOOKING_STATUSES) as [BookingStatus, typeof BOOKING_STATUSES[BookingStatus]][]).map(([key, cfg]) => (
                          <SelectItem key={key} value={key}>
                            <span className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full shadow-sm" style={{ background: cfg.color }} />
                              <span className="font-medium">{cfg.label[lang]}</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}

                {/* Time-of-day boxes (formerly under "Время заселения") */}
                <div className="rounded-xl border border-border/60 bg-muted/30 p-3 grid grid-cols-1 gap-2.5 md:grid-cols-2">
                  <TimingSegment
                    label={t('arrivalTiming')}
                    icon={<Sunrise className="h-3 w-3 text-emerald-500" />}
                    value={earlyCheckin ? 'early' : 'standard'}
                    onChange={(v) => setEarlyCheckin(v === 'early')}
                    options={[
                      { value: 'early', label: t('earlyOption'), time: '08:00', accent: 'emerald' },
                      { value: 'standard', label: t('standardOption'), time: '14:00', accent: 'neutral' },
                    ]}
                  />
                  <TimingSegment
                    label={t('departureTiming')}
                    icon={<Moon className="h-3 w-3 text-amber-500" />}
                    value={lateCheckout ? 'late' : 'standard'}
                    onChange={(v) => setLateCheckout(v === 'late')}
                    options={[
                      { value: 'standard', label: t('standardOption'), time: '12:00', accent: 'neutral' },
                      { value: 'late', label: t('lateOption'), time: '24:00', accent: 'amber' },
                    ]}
                  />
                </div>
              </div>
            </Section>


            {/* 3. CONTACT METHODS — always-open standalone card */}
            <section className="group/section relative rounded-2xl border border-border/60 bg-gradient-to-b from-background to-muted/20 shadow-sm transition-shadow hover:shadow-md overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3">
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-lg"
                  style={{ background: `${statusCfg.color}1f`, color: statusCfg.color }}
                >
                  <Phone className="h-3.5 w-3.5" />
                </span>
                <span className="text-[11px] font-black uppercase tracking-[0.16em] text-foreground/75">
                  {t('contactMethods')}
                </span>
                {(guestPhone || guestWhatsapp || guestEmail || guestTelegram || guestInstagram) && (
                  <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-primary">
                    {[guestPhone, guestWhatsapp, guestEmail, guestTelegram, guestInstagram].filter(Boolean).length}
                  </span>
                )}
              </div>
              <div className="px-4 pb-4">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label={t('phone')} icon={<Phone className="h-3 w-3 text-primary/70" />}>
                    <Input value={guestPhone} onChange={e => setGuestPhone(e.target.value)} placeholder="+998 90 123 45 67" className="h-9 rounded-xl bg-background" />
                  </Field>
                  <Field label={t('whatsapp')} icon={<MessageCircle className="h-3 w-3 text-emerald-500" />}>
                    <Input value={guestWhatsapp} onChange={e => setGuestWhatsapp(e.target.value)} placeholder="+998 90 123 45 67" className="h-9 rounded-xl bg-background" />
                  </Field>
                  <Field label={t('email')} icon={<Mail className="h-3 w-3 text-primary/70" />}>
                    <Input type="email" value={guestEmail} onChange={e => setGuestEmail(e.target.value)} placeholder="email@example.com" className="h-9 rounded-xl bg-background" />
                  </Field>
                  <Field label={t('telegram')} icon={<Send className="h-3 w-3 text-sky-500" />}>
                    <Input value={guestTelegram} onChange={e => setGuestTelegram(e.target.value)} placeholder={t('telegramPlaceholder')} className="h-9 rounded-xl bg-background" />
                  </Field>
                  <Field label={t('instagram')} icon={<Instagram className="h-3 w-3 text-pink-500" />}>
                    <Input value={guestInstagram} onChange={e => setGuestInstagram(e.target.value)} placeholder={t('instagramPlaceholder')} className="h-9 rounded-xl bg-background" />
                  </Field>
                </div>
              </div>
            </section>

            {/* 4. NOTES — always-open standalone card */}
            <section className="group/section relative rounded-2xl border border-border/60 bg-gradient-to-b from-background to-muted/20 shadow-sm transition-shadow hover:shadow-md overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3">
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-lg"
                  style={{ background: `${statusCfg.color}1f`, color: statusCfg.color }}
                >
                  <StickyNote className="h-3.5 w-3.5" />
                </span>
                <span className="text-[11px] font-black uppercase tracking-[0.16em] text-foreground/75">
                  {t('notes')}
                </span>
                {notes && (
                  <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-primary">
                    {notes.length}
                  </span>
                )}
              </div>
              <div className="px-4 pb-4">
                <Textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder={t('specialRequests')}
                  rows={3}
                  className="rounded-xl resize-none bg-background"
                />
              </div>
            </section>


          </div>

          {/* ─────── FOOTER ─────── */}
          <div className="relative flex items-center justify-between gap-3 border-t border-border/60 bg-background/70 px-7 py-4 backdrop-blur">
            <div className="flex items-center gap-2">
              {isEditing && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDelete}
                  className="gap-1.5 rounded-xl border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                >
                  <Trash2 className="h-3.5 w-3.5" />{t('delete')}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setGuestDetailsOpen(true)}
                className="guest-details-cta gap-1.5 overflow-hidden rounded-xl border-primary/35 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Guest Details
              </Button>
              {isEditing && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAnketaOpen(true)}
                  className="gap-1.5 rounded-xl border-primary/35 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground"
                >
                  <ClipboardSignature className="h-3.5 w-3.5" />
                  {t('openAnketa')}
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={onClose} className="rounded-xl">
                {t('cancel')}
              </Button>
              {isAdminOnly ? (() => {
                // Admin cycle: new → Book (booked) → Check In (in-house) → Check Out (checked-out) → Done
                const current = isEditing ? status : 'new';
                let nextStatus: BookingStatus | null = 'booked';
                let label = lang === 'ru' ? 'Забронировать' : lang === 'uz' ? 'Band qilish' : 'Book';
                let disabled = !firstName.trim() || !inDate || !outDate;
                if (isEditing) {
                  if (current === 'booked' || current === 'confirmed' || current === 'pending') {
                    nextStatus = 'in-house';
                    label = lang === 'ru' ? 'Заселить' : lang === 'uz' ? 'Joylashtirish' : 'Check In';
                    // Admin can only check in when the booking's check-in date has arrived (today or earlier).
                    if (inDate && isBefore(startOfDay(new Date()), parseISO(inDate))) {
                      disabled = true;
                    }
                  } else if (current === 'in-house') {
                    nextStatus = 'checked-out';
                    label = lang === 'ru' ? 'Выселить' : lang === 'uz' ? 'Chiqarish' : 'Check Out';
                  } else if (current === 'checked-out') {
                    nextStatus = null;
                    label = lang === 'ru' ? 'Выехал' : lang === 'uz' ? 'Chiqib ketgan' : 'Checked Out';
                    disabled = true;
                  }
                }
                const handleCycle = () => {
                  if (nextStatus) setStatus(nextStatus);
                  handleSave(nextStatus ?? undefined);
                };

                return (
                  <Button
                    size="sm"
                    onClick={handleCycle}
                    disabled={disabled}
                    className="gap-1.5 rounded-xl bg-gradient-to-r from-primary to-primary/85 px-5 shadow-md shadow-primary/30 transition hover:from-primary hover:to-primary hover:shadow-lg hover:shadow-primary/40 disabled:opacity-50"
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                    {label}
                  </Button>
                );
              })() : (
                <Button
                  size="sm"
                  onClick={() => handleSave()}
                  disabled={!firstName.trim() || !inDate || !outDate}
                  className="gap-1.5 rounded-xl bg-gradient-to-r from-primary to-primary/85 px-5 shadow-md shadow-primary/30 transition hover:from-primary hover:to-primary hover:shadow-lg hover:shadow-primary/40 disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" />
                  {t('save')}
                </Button>
              )}
            </div>

          </div>
        </motion.div>
      </DialogContent>

      <HotelGuestAnketaModal
        open={anketaOpen}
        onClose={() => setAnketaOpen(false)}
        booking={editBooking ?? null}
      />
      <GuestDetailsWindow open={guestDetailsOpen} onClose={() => setGuestDetailsOpen(false)} guest={guestDetails} />
      <DeleteBookingModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        booking={editBooking ?? null}
        onConfirm={(id) => {
          onDelete?.(id);
          setDeleteOpen(false);
          onClose();
        }}
      />
    </Dialog>
  );
}

/* ────────────────────────────  Helpers  ──────────────────────────── */

function safeFormat(iso: string, pattern: string) {
  try { return format(parseISO(iso), pattern); } catch { return ''; }
}

interface SectionProps {
  icon: React.ReactNode;
  label: string;
  accent: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}

function Section({ icon, label, accent, right, children }: SectionProps) {
  return (
    <section
      className="group/section relative rounded-2xl border border-border/60 bg-gradient-to-b from-background to-muted/20 p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <header className="mb-3 flex items-center gap-2">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-lg text-foreground/80"
          style={{ background: `${accent}1f`, color: accent }}
        >
          {icon}
        </span>
        <span className="text-[11px] font-black uppercase tracking-[0.16em] text-foreground/75">
          {label}
        </span>
        {right && <div className="ml-auto">{right}</div>}
      </header>
      {children}
    </section>
  );
}

interface FieldProps {
  label: string;
  icon?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
}

function Field({ label, icon, required, children }: FieldProps) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.08em] text-muted-foreground">
        {icon}
        {label}
        {required && <span className="text-destructive">*</span>}
      </span>
      {children}
    </label>
  );
}

/* Segmented timing control */
interface TimingSegmentProps {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; time: string; accent: 'emerald' | 'amber' | 'neutral' }[];
}

function TimingSegment({ label, icon, value, onChange, options }: TimingSegmentProps) {
  const accentClasses: Record<string, string> = {
    emerald: 'from-emerald-500 to-emerald-600 shadow-emerald-500/30',
    amber: 'from-amber-500 to-amber-600 shadow-amber-500/30',
    neutral: 'from-foreground/85 to-foreground/65 shadow-foreground/20',
  };
  return (
    <div className="rounded-xl border border-border/60 bg-card p-2">
      <div className="flex items-center gap-1.5 px-1 pb-1.5">
        {icon}
        <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/40 p-1">
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`relative flex flex-col items-center justify-center gap-0.5 rounded-md px-2 py-1.5 text-[10px] font-black uppercase tracking-wider transition-all duration-200 ${
                active
                  ? `bg-gradient-to-br ${accentClasses[opt.accent]} text-white shadow-md scale-[1.02]`
                  : 'text-muted-foreground hover:bg-background hover:text-foreground'
              }`}
            >
              <span>{opt.label}</span>
              <span className={`text-[9px] font-bold tabular-nums ${active ? 'text-white/90' : 'text-muted-foreground/70'}`}>
                {opt.time}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* Polished themed date picker with floating label */
interface DateFieldProps {
  label: string;
  value: string;
  min?: string;
  accent: 'emerald' | 'rose';
  onChange: (v: string) => void;
}

function DateField({ label, value, min, accent, onChange }: DateFieldProps) {
  return (
    <HotelDatePicker
      label={label}
      value={value}
      min={min}
      onChange={onChange}
      required
      className={accent === 'emerald' ? 'hover:border-emerald-500/45 focus:ring-emerald-500/25' : 'hover:border-rose-500/45 focus:ring-rose-500/25'}
    />
  );
}
