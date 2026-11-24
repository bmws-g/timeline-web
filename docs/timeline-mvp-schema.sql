-- 타임라인(Timeline) MVP 스키마 초안
-- 대상: PostgreSQL 15+ (Supabase) / Spring Boot + PostgreSQL 양쪽에서 그대로 사용 가능
-- 작성일: 2026-11-24
-- 사용법: Supabase SQL Editor 또는 psql -f 로 실행. Supabase가 아니면 아래 auth.users 참조 FK를 users(id) 단독으로 바꾼다.

-- 0) 확장 ------------------------------------------------------------------
create extension if not exists pgcrypto;    -- gen_random_uuid()
create extension if not exists pg_trgm;     -- 이름·별칭 유사 검색
create extension if not exists btree_gist;  -- relations 기간 겹침 방지(exclusion)

-- updated_at 자동 갱신 ------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- 1) users : 앱 사용자 + 알림 시각 설정 -------------------------------------
create table users (
  id                     uuid primary key references auth.users(id) on delete cascade,
  display_name           text,
  timezone               text not null default 'Asia/Seoul',
  locale                 text not null default 'ko-KR',
  interview_enabled      boolean not null default true,   -- 밤 1줄 인터뷰 사용 여부
  interview_time         time not null default '21:30',   -- 로컬 시각 기준 질문 발송
  interview_reminder_time time not null default '23:00',  -- 무응답 시 리마인드 1회
  onboarded_at           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
-- 배치가 "지금 질문 보낼 사용자"를 훑는 경로
create index users_interview_due_idx on users (interview_time) where interview_enabled;

-- 2) style_profiles : 자서전 톤/화법 설정 ----------------------------------
create table style_profiles (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references users(id) on delete cascade,
  tone_key          text not null check (tone_key in ('friend','essay','biography','warm_letter')),
  label             text not null,                 -- '친구에게 말하듯'
  description       text,
  system_prompt     text not null,                 -- 장면 → 서술 변환 프롬프트 본문
  interview_prompt  text,                          -- 밤 질문의 말투 지시
  sample_text       text,                          -- 온보딩 미리보기용 예시 문장
  generation_params jsonb not null default '{}'::jsonb,  -- temperature, max_tokens 등
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);
-- 사용자당 활성 톤 1개
create unique index style_profiles_one_active_idx on style_profiles (user_id) where is_active;

-- 3) events : 하루의 장면(Scene) -------------------------------------------
create table events (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references users(id) on delete cascade,
  event_date        date not null,                  -- 사용자 로컬 날짜 (하루 묶음/챕터 기간 기준)
  started_at        timestamptz not null,
  ended_at          timestamptz,
  title             text,                           -- '신림 카페에서 2시간'
  location_name     text,
  lat               double precision,
  lng               double precision,
  place_id          text,                           -- (선택) POI id, 향후 장소 통합용
  raw_signals       jsonb not null default '{}'::jsonb,   -- photos[], visits[], music[], weather{}, calendar[], steps
  auto_summary      text,                           -- 기기/1차 요약: 건조한 사실 문장
  user_note         text,                           -- 밤 1줄 인터뷰 답변 원문
  mood_tag          text check (mood_tag is null or mood_tag in
                      ('proud','tired','excited','calm','regret','flutter','plain')),
  visibility        text not null default 'private' check (visibility in ('private','persons','public')),
  source_type       text not null check (source_type in
                      ('photo','visit','calendar','manual','health','music')),
  source_ref        text,                           -- 사진 localIdentifier / visit id 등 → 재수집 멱등
  is_highlight      boolean not null default false, -- 그날 물어볼 만한 장면
  interview_state   text not null default 'pending' check (interview_state in
                      ('pending','asked','answered','skipped','not_needed')),
  interview_question text,                          -- 실제 발송한 질문(톤 반영)
  interview_asked_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);
-- 같은 사진/방문을 두 번 올려도 한 행만
create unique index events_source_dedupe_idx on events (user_id, source_type, source_ref)
  where source_ref is not null and deleted_at is null;
-- 홈 타임라인 / 주간 배치 / 챕터 소스 조회의 주 경로
create index events_user_date_idx on events (user_id, event_date desc, started_at);
-- 배치: 오늘 아직 묻지 않은 장면
create index events_interview_idx on events (user_id, event_date) where interview_state = 'pending';
-- 인물 필터·하이라이트 보조
create index events_highlight_idx on events (user_id, event_date desc) where is_highlight;

-- 4) persons : 내 기록 속 인물 (가상 인물 ↔ 실제 가입자 수용) --------------
create table persons (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null references users(id) on delete cascade,  -- 이 인물이 등장하는 기록의 주인
  display_name    text not null,
  disambiguator   text,                        -- 동명이인 구분: '회사', '대학', '동네'
  linked_user_id  uuid references users(id) on delete set null,  -- 실제 가입자와 매칭(늦은 바인딩)
  link_status     text not null default 'local' check (link_status in ('local','invited','linked','declined')),
  linked_at       timestamptz,
  note            text,
  first_seen_on   date,                        -- 인물 목록/타임라인 캐시 (배치 갱신)
  last_seen_on    date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
-- 같은 사용자가 같은 실제 계정을 두 번 링크하지 않도록
create unique index persons_owner_linked_idx on persons (owner_user_id, linked_user_id)
  where linked_user_id is not null;
create index persons_owner_name_trgm_idx on persons using gin (display_name gin_trgm_ops);
create index persons_linked_idx on persons (linked_user_id) where linked_user_id is not null;

-- 5) person_aliases : 별칭 이력 --------------------------------------------
create table person_aliases (
  id          uuid primary key default gen_random_uuid(),
  person_id   uuid not null references persons(id) on delete cascade,
  alias       text not null,                   -- '김대리', '민수형', '민수'
  normalized  text not null,                   -- 소문자·공백제거 정규화(매칭용)
  source      text not null default 'manual' check (source in ('manual','auto','import')),
  created_at  timestamptz not null default now(),
  unique (person_id, alias)
);
create index person_aliases_norm_trgm_idx on person_aliases using gin (normalized gin_trgm_ops);

-- 6) relations : 기간별 호칭·관계 이력 -------------------------------------
create table relations (
  id             uuid primary key default gen_random_uuid(),
  person_id      uuid not null references persons(id) on delete cascade,
  relation_type  text not null,      -- 'coworker','boss','friend','family','partner','classmate'
  label          text,               -- 표시용 '직장 상사'
  period         daterange not null, -- [valid_from, valid_to) : 열린 구간이면 현재
  is_current     boolean generated always as (upper_inf(period)) stored,
  note           text,
  created_at     timestamptz not null default now(),
  -- 같은 인물의 관계 기간이 겹치지 않게 강제
  exclude using gist (person_id with =, period with &&)
);
create index relations_person_period_idx on relations (person_id, period desc);

-- 7) event_persons : 사건 ↔ 인물 N:M + 역할/시점 메모 ----------------------
create table event_persons (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  person_id   uuid not null references persons(id) on delete cascade,
  role        text not null default 'together' check (role in
                ('together','met','called','mentioned','passing')),
  pov         text not null default 'self' check (pov in ('self','other_guess')),  -- 내 시점 / 상대 시점 추정
  note        text,                 -- 이 사건에서 그 사람에 대한 내 시점 메모(비공개)
  share_note  text,                 -- 공유 시 상대에게 보여줄 한 줄
  created_at  timestamptz not null default now(),
  unique (event_id, person_id)
);
-- 인물별 타임라인: person → events(event_date) 조인 경로
create index event_persons_person_idx on event_persons (person_id, event_id);
create index event_persons_event_idx on event_persons (event_id);

-- 같은 사용자의 사건에 남의 인물을 붙이지 못하게 강제 ----------------------
create or replace function assert_event_person_same_owner() returns trigger
language plpgsql as $$
begin
  if not exists (
    select 1 from events e join persons p on p.id = new.person_id
    where e.id = new.event_id and e.user_id = p.owner_user_id
  ) then
    raise exception 'event_persons: event % and person % belong to different users',
      new.event_id, new.person_id;
  end if;
  return new;
end $$;

create trigger event_persons_same_owner
before insert or update on event_persons
for each row execute function assert_event_person_same_owner();

-- 8) chapters : 주간/월간 자서전 결과물 ------------------------------------
create table chapters (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references users(id) on delete cascade,
  kind             text not null check (kind in ('week','month','year')),
  period_start     date not null,
  period_end       date not null,
  seq              int not null default 1,          -- 책 안에서의 장 순서
  title            text,
  body_md          text,
  summary          text,                            -- 목록 카드용 1~2줄
  style_profile_id uuid references style_profiles(id) on delete set null,  -- 생성 당시 톤 스냅샷
  event_ids        uuid[] not null default '{}',    -- 배열 순서 = 서술 순서
  event_count      int not null default 0,
  cover_event_id   uuid references events(id) on delete set null,
  status           text not null default 'draft' check (status in ('draft','published','edited')),
  version          int not null default 1,
  model            text,
  prompt_version   text,
  generated_at     timestamptz,
  visibility       text not null default 'private' check (visibility in ('private','public')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, kind, period_start, version),
  check (period_end >= period_start)
);
create index chapters_user_period_idx on chapters (user_id, kind, period_start desc);
create index chapters_event_ids_gin on chapters using gin (event_ids);

-- updated_at 트리거 --------------------------------------------------------
create trigger users_updated_at      before update on users      for each row execute function set_updated_at();
create trigger events_updated_at     before update on events     for each row execute function set_updated_at();
create trigger persons_updated_at    before update on persons    for each row execute function set_updated_at();
create trigger chapters_updated_at   before update on chapters   for each row execute function set_updated_at();

-- RLS : 모든 테이블은 소유자만 읽고 쓴다 ------------------------------------
alter table users          enable row level security;
alter table style_profiles enable row level security;
alter table events         enable row level security;
alter table persons        enable row level security;
alter table person_aliases enable row level security;
alter table relations      enable row level security;
alter table event_persons  enable row level security;
alter table chapters       enable row level security;

create policy users_self on users
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy style_own on style_profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy events_own on events
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy chapters_own on chapters
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy persons_own on persons
  for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

create policy person_aliases_own on person_aliases
  for all
  using (exists (select 1 from persons p where p.id = person_id and p.owner_user_id = auth.uid()))
  with check (exists (select 1 from persons p where p.id = person_id and p.owner_user_id = auth.uid()));

create policy relations_own on relations
  for all
  using (exists (select 1 from persons p where p.id = person_id and p.owner_user_id = auth.uid()))
  with check (exists (select 1 from persons p where p.id = person_id and p.owner_user_id = auth.uid()));

create policy event_persons_own on event_persons
  for all
  using (exists (select 1 from events e where e.id = event_id and e.user_id = auth.uid()))
  with check (exists (select 1 from events e where e.id = event_id and e.user_id = auth.uid()));

-- 톤 프리셋 시드(예시) ------------------------------------------------------
-- 프리셋 본문은 앱/서버 설정(JSON)에서 관리하고, 온보딩에서 고른 1개를 style_profiles에 복사한다.
-- insert into style_profiles (user_id, tone_key, label, description, system_prompt, interview_prompt, sample_text)
-- values ('<uuid>', 'friend', '친구에게 말하듯', '편한 반말, 농담 섞인 톤',
--   '당신은 사용자의 오랜 친구입니다. 아래 장면 JSON을 1인칭 반말로, ...',
--   '오늘 있었던 일을 친구에게 말 걸듯 짧게 물어보세요.',
--   '오늘 신림에서 두 시간이나 있었네, 거기서 뭐 했어?');
