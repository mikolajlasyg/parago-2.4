# Paragon AI — wdrożenie (Vercel + Groq + Supabase + Stripe)

## Co jest w paczce
- `src/App.jsx` — cała aplikacja · `public/` — ikony PWA i manifest (wgraj ten folder!)
- `src/main.jsx`, `index.html`, `vite.config.js`, `package.json` — projekt Vite
- `.env.example` — wzór zmiennych środowiskowych

Aplikacja działa w 3 poziomach — każdy kolejny włączasz zmiennymi środowiskowymi:
1. **Bez niczego** → tryb lokalny (bez logowania, dane na urządzeniu, płatność symulowana)
2. **+ Supabase** → prawdziwe konta (e-mail+hasło, Google) i synchronizacja w chmurze
3. **+ Stripe** → prawdziwe płatności za plany

---

## 1. Skanowanie (Groq — darmowy)
1. https://console.groq.com → API Keys → **Create API Key** (`gsk_...`)
2. Vercel → Settings → Environment Variables → `VITE_GROQ_API_KEY` = klucz

## 2. Konta i chmura (Supabase — darmowy)
1. https://supabase.com → **New project** (nazwa np. paragon-ai, region EU)
2. Po utworzeniu: **Project Settings → API** → skopiuj:
   - `Project URL` → zmienna `VITE_SUPABASE_URL`
   - `anon public` key → zmienna `VITE_SUPABASE_ANON_KEY`
3. **SQL Editor → New query** → wklej i uruchom (tworzy tabelę na dane użytkowników):
```sql
create table if not exists user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz default now()
);
alter table user_state enable row level security;
create policy "own state" on user_state
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```
4. **Authentication → Sign In / Up → Email** → dla szybkiego startu wyłącz
   „Confirm email" (użytkownik loguje się od razu po rejestracji).
5. *(Opcjonalnie — przycisk Google)* **Authentication → Sign In / Up → Google**:
   wymaga Client ID/Secret z Google Cloud Console (instrukcja jest w panelu Supabase).
   Bez tego przycisk Google pokaże komunikat, a e-mail+hasło działa normalnie.
6. Dodaj obie zmienne w Vercel i zrób **Redeploy**.

**Jak to działa:** przy pierwszym logowaniu dane z telefonu przenoszą się na konto (toast „Dane przeniesione ☁️"). Potem każda zmiana zapisuje się lokalnie i w chmurze. Wylogowanie nie kasuje danych z konta.

## 3. Płatności (Stripe)
1. https://stripe.com → załóż konto (do testów wystarczy tryb testowy)
2. **Product catalog → Add product** — utwórz 3 produkty (Starter 9,99 zł/mies., Pro 19,99, Family 29,99; opcjonalnie warianty roczne −30%)
3. Dla każdego: **Create payment link**. W ustawieniach linku →
   **After payment → Redirect customers to your website** i wpisz:
   - Starter mies.: `https://TWOJA-APKA.vercel.app/?paid=starter&cycle=m`
   - Pro mies.: `https://TWOJA-APKA.vercel.app/?paid=pro&cycle=m`
   - Family mies.: `https://TWOJA-APKA.vercel.app/?paid=family&cycle=y` *(analogicznie roczne z `cycle=y`)*
4. Wklej linki jako zmienne w Vercel (wystarczą miesięczne; roczne opcjonalnie):
   `VITE_STRIPE_LINK_STARTER`, `VITE_STRIPE_LINK_PRO`, `VITE_STRIPE_LINK_FAMILY`
   (+ `_Y` warianty roczne, np. `VITE_STRIPE_LINK_PRO_Y`) → **Redeploy**

**Jak to działa:** przycisk „Wybieram plan" przenosi do bezpiecznej strony płatności Stripe (karta/BLIK), a po opłaceniu wraca do aplikacji i plan aktywuje się automatycznie.

⚠️ **Uczciwa uwaga (MVP):** aktywacja po powrocie dzieje się w przeglądarce — sprytny użytkownik mógłby ją wywołać bez płacenia. Na start (znajomi, pierwsi userzy) to wystarczy; zanim ruszysz z reklamą, zrobimy weryfikację po stronie serwera (webhook Stripe + Supabase Edge Function) — powiedz, kiedy będziesz gotowy.

## 4. Test lokalny (opcjonalnie)
```
npm install
cp .env.example .env   # uzupełnij klucze
npm run dev
```

## ✅ CHECKLISTA: odpal wszystko w 20 minut
1. **Groq** (skan): klucz → `VITE_GROQ_API_KEY` w Vercel → Redeploy → *test: zeskanuj paragon*
2. **Supabase** (konta+chmura): projekt → SQL z sekcji 2 → wyłącz Confirm email → 2 zmienne → Redeploy → *test: wyloguj się w Profilu, załóż konto, dane wracają*
3. **Google** (opcjonalnie): w Supabase → Authentication → Google (Client ID/Secret wg podpowiedzi w panelu) → *test: przycisk „Kontynuuj z Google"*
4. **Stripe** (płatności): 3 Payment Linki z przekierowaniami `?paid=...&cycle=...` → 3 zmienne → Redeploy → *test: kup plan w trybie testowym Stripe (karta 4242 4242 4242 4242)*
Po każdej zmianie zmiennych w Vercel **musi być Redeploy** — inaczej nie działają.

## 👨‍👩‍👧 Plan Family — multi-konto (każdy loguje się osobno, wspólne dane)

**SQL do uruchomienia** (Supabase → SQL Editor → New query → wklej i Run):

```sql
create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Moja rodzina',
  owner_id uuid not null references auth.users(id) on delete cascade,
  invite_code text unique not null,
  created_at timestamptz default now()
);

create table if not exists household_members (
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text,
  joined_at timestamptz default now(),
  primary key (household_id, user_id)
);

create table if not exists household_state (
  household_id uuid primary key references households(id) on delete cascade,
  state jsonb not null default '{}',
  updated_at timestamptz default now()
);

alter table households enable row level security;
alter table household_members enable row level security;
alter table household_state enable row level security;

create policy "auth can view households" on households for select using (auth.role() = 'authenticated');
create policy "owner creates household" on households for insert with check (owner_id = auth.uid());
create policy "owner updates household" on households for update using (owner_id = auth.uid());
create policy "owner deletes household" on households for delete using (owner_id = auth.uid());

create policy "auth can view members" on household_members for select using (auth.role() = 'authenticated');
create policy "user joins as self" on household_members for insert with check (user_id = auth.uid());
create policy "user leaves self" on household_members for delete using (user_id = auth.uid());
create policy "owner removes member" on household_members for delete using (
  household_id in (select id from households where owner_id = auth.uid())
);

create policy "members view state" on household_state for select using (
  household_id in (select household_id from household_members where user_id = auth.uid())
);
create policy "members insert state" on household_state for insert with check (
  household_id in (select household_id from household_members where user_id = auth.uid())
);
create policy "members update state" on household_state for update using (
  household_id in (select household_id from household_members where user_id = auth.uid())
);
```

**Jak to działa:** właściciel zakłada rodzinę (Profil → Rodzina → Załóż) → dostaje 6-znakowy kod zaproszenia → wysyła go domownikowi (SMS, WhatsApp, cokolwiek) → domownik zakłada **własne** konto e-mail w apce → Profil → Rodzina → Dołącz kodem → od tej chwili obaj widzą te same paragony, budżet i cele, każdy zalogowany osobno na swoim telefonie. Dane synchronizują się automatycznie, tak jak zwykła chmura.

## Kopia zapasowa
Profil → Dane → **Kopia zapasowa** (plik JSON) / **Przywróć z kopii**. Z kontem Supabase dane i tak są w chmurze.
