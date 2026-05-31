import { useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { useI18n, type Lang } from '@/hooks/useI18n';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const LANGS: { code: Lang; flag: string; name: string; short: string }[] = [
  { code: 'ru', flag: '🇷🇺', name: 'Русский', short: 'RU' },
  { code: 'uz', flag: '🇺🇿', name: "O'zbek", short: 'UZ' },
  { code: 'en', flag: '🇬🇧', name: 'English', short: 'EN' },
];

/**
 * Language switcher for the hotel navbar.
 *
 * Uses a Radix Popover (via shadcn) so the menu is rendered through a portal
 * directly under <body> with z-index 50+. This guarantees the dropdown floats
 * above the timeline grid, sticky headers, and booking bars — fixing the
 * "dropdown hides behind table" bug from the original implementation.
 */
export function HotelLanguageDropdown() {
  const { lang, setLang } = useI18n();
  const [open, setOpen] = useState(false);
  const current = LANGS.find(l => l.code === lang)!;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1.5 rounded-xl bg-white/10 backdrop-blur-sm px-2.5 py-2 text-sm font-semibold text-white border border-white/15 hover:bg-white/20 hover:border-white/25 transition-all duration-300 hover:scale-105 hover:shadow-lg group whitespace-nowrap"
          aria-label={current.name}
          title={current.name}
        >
          <span className="text-base leading-none transition-transform duration-300 group-hover:scale-110">{current.flag}</span>
          <span className="font-bold tracking-wide">{current.short}</span>
          <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="z-[100] min-w-[220px] rounded-xl bg-card border border-border shadow-2xl overflow-hidden p-0"
      >
        <div className="dropdown-animate">
          {LANGS.map((l) => {
            const active = lang === l.code;
            return (
              <button
                key={l.code}
                onClick={() => { setLang(l.code); setOpen(false); }}
                className={`flex w-full items-center gap-3 px-4 py-3.5 text-sm font-medium transition-all duration-200
                  ${active ? 'bg-primary/10 text-primary font-bold' : 'text-foreground hover:bg-muted hover:pl-5'}`}
              >
                <span className="text-xl leading-none">{l.flag}</span>
                <span>{l.name}</span>
                {active && <Check className="ml-auto h-4 w-4 text-primary" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
