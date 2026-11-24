# 타임라인 (Timeline) MVP 설계 초안

> 작성일 2026-11-24 · 바탕: `timeline-app.md` (자동 기록 + 밤 1줄 인터뷰 + 온보딩 톤 선택, `Event ↔ Person` 확장성, 프라이버시/시점 분리)
> 범위: 아이디어 노트 8번의 2주 컷 3대 기능 — ① 사진/위치 기반 오늘의 장면 추출 ② 밤 1줄 인터뷰 ③ 선택한 톤으로 주간 단편 생성. HealthKit 연동·결제·지인 공유 *기능*은 빼고, 스키마에 자리만 열어 둔다.
> 실행 가능한 DDL 전문은 같은 폴더의 `timeline-mvp-schema.sql` (PostgreSQL 15 문법 검증 완료). 이 문서는 그 스키마의 근거와 화면·배치 설계를 담는다.

## 0. 이번 설계에서 확정한 것

- 기록의 최소 단위는 '장면(Scene)' = `events` 한 행. 시간·장소·원본 신호·내 한 줄 답변이 한 곳에 모이고, 인물은 문자열이 아니라 `persons` 행으로 분리해 N:M으로 붙인다.
- 사용자마다 자기 사건만 소유한다(`events.user_id`). 인물은 `persons`의 사본이며 `linked_user_id`로 나중에 실제 가입자와 연결된다(늦은 바인딩). 그래서 두 사람이 연결돼도 한 사건을 덮어쓰지 않고 각자 시점으로 나란히 갖는다.
- 챕터(주간/월간 단편)는 원본을 고치지 않는 파생물이다. `chapters.event_ids`에 서술 순서대로 장면 id를 담고, 생성 당시 쓴 톤을 `style_profile_id`로 스냅샷해 둔다. 톤을 바꿔도 과거 챕터는 흔들리지 않고, 원할 때만 같은 기간을 새 버전으로 재생성한다.
- 밤 인터뷰 상태는 `events.interview_state`로 관리한다(`pending → asked → answered|skipped`). 질문 발송은 10분 tick 배치가 사용자 로컬 시각 기준으로 훑는다.

## 1. 데이터 모델 (PostgreSQL / Supabase)

### 1.1 관계 한눈에

- `users` 1 ─ N `style_profiles` (사용자당 활성 톤 1개, 나머지는 이력)
- `users` 1 ─ N `events` (장면)
- `users` 1 ─ N `persons` (`owner_user_id` = 내 기록 속 인물 명부)
- `persons` 1 ─ N `person_aliases` (별칭: 김대리·김과장·민수형)
- `persons` 1 ─ N `relations` (기간별 관계: 입사~승진 구간은 '동료', 승진 이후는 '상사'처럼 구간을 나눠 기록)
- `events` N ─ M `persons` = `event_persons` (역할 + 내 시점 메모 + 공유용 한 줄)
- `users` 1 ─ N `chapters` ─(`event_ids uuid[]`)→ `events`
- `persons.linked_user_id` → `users` (가상 인물 ↔ 실제 가입자, nullable)

### 1.2 설계 원칙 4가지

1. 원본과 파생을 분리한다. `events`는 사실(시간·장소·신호·답변), `chapters`는 AI가 쓴 서술. AI는 원본을 절대 수정하지 않고, 챕터 재생성은 원본에서 다시 계산한다.
2. 사람은 명부(`persons`)로, 이름은 이력(`person_aliases`)으로 분리한다. 표시 이름이 바뀌어도 같은 사람이면 같은 id다.
3. 사건–인물 연결에 '관계'가 아니라 '역할'과 '시점 메모'를 저장한다. "이 장면에서 함께 있었다(`together`)"는 사실이고, "그날 나는 좀 서운했다"는 내 시점 메모(`note`)다. 둘을 분리해야 지인 공유 때 보여줄 것만 골라낼 수 있다.
4. 모든 테이블이 `user_id`(또는 `owner_user_id`)로 닫혀 있고 RLS로 그 사용자만 읽고 쓴다. 교차 타임라인은 RLS를 풀어서가 아니라 서버(서비스 롤/Edge Function)가 명시적으로 중개한다.

### 1.3 테이블별 정의

**`users`** — 앱 사용자. PK `id` = Supabase `auth.users(id)`(`on delete cascade`), FK 없음.
- `timezone` (기본 `Asia/Seoul`), `interview_enabled`, `interview_time`(기본 21:30), `interview_reminder_time`(기본 23:00), `onboarded_at`
- 인덱스: `users (interview_time) where interview_enabled` — 배치가 "지금 질문 보낼 사람"을 훑는 경로. 사용자 수가 커지면 `timezone`별로 나눠 오프셋 계산하는 편이 낫다(시각 비교를 UTC로 미리 계산해 두는 `next_ask_at timestamptz` 컬럼 추가가 다음 단계 후보).

**`style_profiles`** — 온보딩에서 고른 자서전 톤. PK `id`, FK `user_id → users(id)` cascade. `tone_key`(friend/essay/biography/warm_letter), `label`, `system_prompt`(장면→서술 변환), `interview_prompt`(질문 말투), `sample_text`(온보딩 미리보기 문장), `generation_params jsonb`(temperature·max_tokens).
- 핵심 인덱스: `unique (user_id) where is_active` — 활성 톤은 항상 1개. 톤을 바꾸면 기존 행을 `is_active=false`로 내리고 새 행을 넣는다. 과거 챕터는 자기 `style_profile_id`를 계속 참조하므로 이력이 남는다.
- 프리셋 본문은 앱 설정(JSON)에서 관리하고, 온보딩에서 고른 것 1개를 사용자 행으로 복사한다. 프리셋을 고칠 때 기존 사용자 문체가 바뀌지 않게 하기 위함이다.

**`events`** — 하루의 장면. 화면 용어는 '장면', 테이블명은 `events`(아이디어 노트의 `Scene/Event`와 같은 단위). PK `id`, FK `user_id → users(id)` cascade.
- 시간: `event_date`(사용자 로컬 날짜 — 하루 묶음·챕터 기간의 기준), `started_at`, `ended_at`
- 장소: `location_name`, `lat`, `lng`, `place_id`(선택, 향후 POI 통합)
- 신호: `raw_signals jsonb` — `{photos:[{id,thumb,exif}], visits:[{arrived,left,placeId}], music:[{title,artist,count}], weather:{temp,cond,pm}, calendar:[{title,start}], steps}`
- 사람이 넣은 것: `user_note`(1줄 답변 원문), `mood_tag`(proud/tired/excited/calm/regret/flutter/plain)
- 상태: `visibility`(private/persons/public), `source_type`(photo/visit/calendar/manual/health/music), `source_ref`(사진 localIdentifier·visit id), `is_highlight`, `interview_state`, `interview_question`, `interview_asked_at`, `deleted_at`
- 인덱스 세 개가 사실상 전부다:
  - `unique (user_id, source_type, source_ref) where source_ref is not null and deleted_at is null` — 같은 사진·방문을 다시 올려도 한 행. 동기화가 재시도돼도 중복이 안 생긴다(멱등 수집의 핵심).
  - `(user_id, event_date desc, started_at)` — 홈 타임라인, 주간/월간 챕터 소스, 인물 필터의 공통 경로.
  - `(user_id, event_date) where interview_state='pending'` — 배치가 오늘 아직 안 물은 장면만 골라낸다.
- `title`은 "신림 카페에서 2시간" 같은 자동 라벨, `auto_summary`는 기기에서 만든 건조한 사실 문장. 인터뷰 답변이 없으면 챕터는 `auto_summary`만으로 채운다(무입력 날이 끊기지 않는 구조).

**`persons`** — 내 기록 속 인물 명부. PK `id`, FK `owner_user_id → users(id)` cascade, `linked_user_id → users(id)` set null. `owner_user_id`(명부 주인), `display_name`, `disambiguator`('회사'·'대학' — 동명이인 구분), `linked_user_id`, `link_status`(local/invited/linked/declined), `linked_at`, `note`, `first_seen_on`, `last_seen_on`(목록·타임라인용 캐시).
- 인덱스: `unique (owner_user_id, linked_user_id) where linked_user_id is not null`(같은 계정 중복 링크 방지), `gin (display_name gin_trgm_ops)`(이름 유사 검색 — "민수"로 "김민수" 찾기), `(linked_user_id)`(연결된 상대가 자기 쪽 인물을 찾을 때).
- 같은 실존 인물이라도 사용자마다 별도 행을 갖는다. 이게 프라이버시 경계이자 시점 분리의 토대다.

**`person_aliases`** — 별칭 이력. PK `id`, FK `person_id → persons(id)` cascade. `alias`('김대리'), `normalized`(소문자·공백 제거), `source`(manual/auto/import), `unique (person_id, alias)`, `gin (normalized gin_trgm_ops)`.
- 인물 자동 매칭은 `display_name` + `normalized` 별칭 전체를 trigram 검색해 후보를 뽑고, 애매하면(동명이인) 앱에서 "이 사람 맞나요?" 1탭으로 확정한다. 자동 병합은 하지 않는다.

**`relations`** — 기간별 관계. PK `id`, FK `person_id → persons(id)` cascade. `relation_type`(coworker/boss/friend/family/partner/classmate), `label`('직장 상사'), `period daterange`, `is_current`(열린 구간 = 현재), `note`.
- `exclude using gist (person_id with =, period with &&)` — 한 인물의 관계 기간이 겹치지 않음을 DB가 강제한다. 승진으로 관계가 바뀌면 이전 구간을 닫고 새 구간을 연다. `btree_gist` 확장 필요.
- 인덱스: `(person_id, period desc)` — "그때 그 사람은 무슨 사이였나"를 장면 날짜로 조회하는 경로.

**`event_persons`** — 사건 ↔ 인물. PK `id`, FK `event_id → events(id)` cascade, `person_id → persons(id)` cascade. `role`(together/met/called/mentioned/passing), `pov`(self/other_guess), `note`(내 시점 메모·비공개), `share_note`(공유 시 상대에게 보여줄 한 줄), `unique (event_id, person_id)`.
- 인덱스: `(person_id, event_id)` — 인물별 타임라인은 `persons → event_persons → events(event_date)` 순으로 조인한다. person 기준 인덱스가 없으면 인물 화면이 매번 전체 스캔이 된다.
- 트리거 `assert_event_person_same_owner` — 사건의 `user_id`와 인물의 `owner_user_id`가 다르면 insert를 막는다. 남의 인물 명부 id를 붙이는 사고를 DB에서 차단한다.

**`chapters`** — 주간/월간 자서전. PK `id`, FK `user_id → users(id)` cascade, `style_profile_id → style_profiles(id)` set null, `cover_event_id → events(id)` set null. `kind`(week/month/year), `period_start`, `period_end`, `seq`(책의 장 순서), `title`, `body_md`, `summary`(카드용 1~2줄), `style_profile_id`(생성 당시 톤), `event_ids uuid[]`(배열 순서 = 서술 순서), `event_count`, `cover_event_id`, `status`(draft/published/edited), `version`, `model`, `prompt_version`, `generated_at`, `visibility`.
- `unique (user_id, kind, period_start, version)` — 배치가 두 번 돌아도 같은 주차의 같은 버전은 한 행. 재생성은 `version+1` insert이고, 이전 버전은 남겨 "예전 톤으로 다시 읽기"가 가능하다.
- `event_ids`를 배열로 둔 이유: 챕터는 "이 장면들"의 정렬된 묶음이고, 읽기 화면은 항상 한 번에 전체를 가져온다. 조인 테이블(`chapter_events`)로 정규화하면 장면별 메모·순서 편집에는 유리하지만 질의가 한 단계 늘어 MVP에서는 손해다. 장면별 챕터 내 코멘트가 필요해지는 시점에 `chapter_events(chapter_id, event_id, position, note)`로 이관하면 된다(`chapters.event_ids`를 그대로 채워 넣으면 되므로 이관 비용이 작다).
- 인덱스: `(user_id, kind, period_start desc)`(리더 목록), `gin (event_ids)`("이 장면이 실린 챕터" 역조회 — 장면 상세에서 '이 장면이 들어간 단편' 표시).

## 2. 확장 근거: 지인 공유·교차 타임라인·시각화

- **같은 사건, 각자의 사본.** 내 `events` 행과 그 사람의 `events` 행은 별개다. 연결은 `event_persons`(내 쪽) ↔ 상대 쪽 `persons`에 내 `linked_user_id`가 붙는 방식으로 성립한다. 따라서 상대가 자기 기억을 고쳐도 내 기록은 그대로이고, 합쳐 보여줄 때는 서버가 두 사본을 시간축에 나란히 놓는다. 덮어쓰기 충돌이 구조적으로 불가능하다.
- **가상 인물에서 실계정으로의 늦은 바인딩.** `persons.link_status`가 `local → invited → linked`로 바뀌는 것만으로 10년치 기록의 "민수"가 한 번에 실계정과 이어진다. 별칭·관계 이력이 그대로 붙어 있으므로 과거 장면도 소급해서 연결된다.
- **공개 범위와 시점의 분리.** `events.visibility`가 사건 자체의 범위, `event_persons.share_note`가 그 사건에서 상대에게 보일 한 줄, `note`는 내 속마음이다. 공유 챕터는 `share_note`와 `auto_summary`만으로 조립하고 `note`는 절대 내보내지 않는다.
- **인물별 시각화의 집계 계층.** 수년 치 그래프가 커지면 `event_persons`(person_id, event_id) + `events(event_date)` 조인으로 인물별 등장 밀도를 매번 세지 말고, `persons.last_seen_on`처럼 요약 컬럼을 두거나 배치에서 `person_month_density(person_id, month, event_count)` 구체화 뷰를 만든다. 스키마는 그대로 두고 뷰만 얹으면 된다.
- **챕터가 파생물이라는 점.** 톤을 바꾸거나 모델을 갈아도 `chapters`만 다시 만들면 된다. 원본 `events`와 인물 그래프는 손대지 않는다.

## 3. 화면 흐름 (5개)

### 3.1 온보딩 — 톤 선택 + 최소 권한
1. 인트로 1장: "매일 쓰지 않아도 쌓이는 자서전" 한 문장 + 샘플 장면 1개(더미).
2. 톤 선택: 4개 카드(친구에게 말하듯 / 담담한 에세이 / 묵직한 전기 / 따뜻한 편지). 각 카드는 같은 장면을 그 톤으로 쓴 `sample_text` 2~3줄을 보여준다. 여기서 고른 것이 `style_profiles` 1행이 된다.
3. 인터뷰 시간: 기본 21:30, "나중에 바꿀 수 있어요" 문구.
4. 권한 3개를 한 화면에 사유와 함께: 사진(제한 접근 허용 — 선택한 앨범만도 가능), 위치("방문 감지"를 위해 필요, '항상' 거부해도 앱은 동작), 알림(밤 질문용). 각각 거부 시 대체 동작을 그 자리에서 안내: 사진 거부 → 위치·수동 기록만, 위치 거부 → 사진·수동 기록만, 알림 거부 → 앱 열 때 인터뷰 카드로 노출.
5. 첫 장면 미리보기: 오늘 위치·사진으로 만든 장면 카드 1장을 보여 주고 "이런 식으로 쌓입니다" → 홈.
- API: `POST /onboarding` (톤 + 알림 시각 + 권한 결과), `GET /style-presets`.

### 3.2 홈 — 책 진행감 + 오늘 + 주간 단편
- 상단: 책 진행감("현재 42페이지 · 3장 집필 중" — `chapters` published 수와 장면 수로 계산). 스트릭·연속일수 압박은 넣지 않는다.
- 오늘의 자동 수집 타임라인: 시간순 장면 카드. 카드 = 시각 · 장소 · 사진 썸네일 수 · 날씨 한 줄 · 인물 칩. 답변이 붙은 장면은 답변 한 줄을 카드에 그대로 보여준다(내가 쓴 문장이 책에 들어갔다는 감각).
- 밤 인터뷰 카드: 21:30 이후 또는 앱 진입 시 "오늘 3장면 중 2개만 물어볼게요" → ③으로.
- 최신 주간 단편 카드: 표지(대표 사진) + 제목 + 2줄 요약 → ④ 리더.
- '1년 전 오늘' 1장: 같은 날짜의 과거 장면·BGM.
- 빈 상태(무입력 날): "오늘은 조용했네요" + 자동 신호만으로 채운 장면 카드 + 어제의 짧은 회고. 에러 시 캐시된 로컬 타임라인을 먼저 그린다.
- API: `GET /home` (오늘 장면 + 최신 챕터 + 1년 전 + 진행감을 한 번에).

### 3.3 밤 1줄 인터뷰 — 5초 입력
- 진입: 푸시 → 장면 카드 1개 전체 화면. 질문은 고른 톤의 말투로 1문장("오늘 신림에 2시간 계셨네요, 무슨 일이셨어요?"). 장소·시간·사진 1장이 질문 위에 붙는다.
- 입력 3가지: 텍스트 한 줄(기본, 자동 포커스) / 음성 5초(STT는 온디바이스 우선, 실패 시 서버) / 감정·인물 원탭 칩(감정 7종, 인물은 `persons`에서 최근 5명).
- 하루 질문 수: 하이라이트 최대 3개. 각 카드 30초 안에 끝나게 하고, 답하지 않고 넘겨도 `skipped`로 두고 `auto_summary`로 페이지를 채운다. 답변 즉시 `events.user_note`·`mood_tag`·`event_persons`에 저장.
- 흐름: 푸시(21:30) → 무응답 시 리마인드 1회(23:00) → 이후 조용히 종료. 알림을 끈 사용자는 홈의 인터뷰 카드로만 노출.
- API: `GET /interview/today`, `POST /interview/{eventId}/answer` (note, mood, personIds, voice?).

### 3.4 챕터 리더 — 선택한 톤의 주간/월간 단편
- 목록: 옆으로 넘기는 책장(주간 단편 카드). 상단에 "3장 · 2026년 11월" 같은 구분.
- 리더: 세로 스크롤 본문, 문단마다 근거 장면을 붙여 둔다(`body_md` 문단 머리에 `[[e:<eventId>]]` 마커, 클라이언트가 파싱해 마커를 숨기고 문단 탭 → "이 장면 고치기"(장면 상세로 이동, 한 줄 수정)로 연결). 수정하면 `chapters.status='edited'`, `version` 유지(사용자 편집은 덮어쓰기 허용 — 이건 원본 `events`가 아니라 파생물이므로 안전).
- 하단: "다른 톤으로 다시 쓰기"(새 `version` 생성, 이전 버전 보존) / "이 주의 장면 12개 보기".
- 상태: 생성 중(draft + 스켈레톤), 근거 장면이 모두 삭제된 경우 안내 문구, 첫 주에는 샘플 챕터(더미)로 리더 UI를 먼저 보여 준다.
- API: `GET /chapters?kind=week`, `GET /chapters/{id}`, `PATCH /chapters/{id}`, `POST /chapters/{id}/regenerate`.

### 3.5 인물/추억 모아보기 — MVP는 필터 수준
- 목록: 내 기록 속 인물(등장 횟수 · 최근 만남 `last_seen_on`) → 탭하면 인물 타임라인.
- 인물 상세: 그 사람과 함께한 장면만 연도별로. 상단에 호칭 이력 타임라인("2021 김대리 → 2023 김과장 → 2025 예전 동료"). 그 사람에게 공유될 한 줄(`share_note`)만 모아 보기 토글.
- MVP 경계: 초대·연결·상대 타임라인 열람은 넣지 않는다. `link_status='local'`인 인물에 "나중에 이 사람과 기억을 나눌 수 있어요" 안내만.
- API: `GET /persons`, `GET /persons/{id}/timeline`, `PATCH /persons/{id}` (이름·별칭·관계 정리).

## 4. 기술 구성과 배치 흐름

### 4.1 스택
- 클라이언트: **React Native + Expo** (TypeScript). `expo-location`(백그라운드 위치·지오펜싱), `expo-media-library`+`expo-image-picker`(사진·EXIF), `expo-notifications`(밤 질문 푸시), `expo-audio`(5초 음성 메모 — SDK 52+에서 `expo-av`를 대체), `expo-secure-store`(세션). 로컬 SQLite(`expo-sqlite`)에 미전송 장면 큐를 두고 `source_ref`로 재전송 멱등을 보장한다.
- 주의: iOS의 방문 감지(`CLLocationManager.startMonitoringVisits`)는 expo-location에 노출돼 있지 않다. 지오펜싱(반경 등록)으로 시작하고, 저전력 Visit 이벤트가 필요해지면 얇은 네이티브 모듈(config plugin)로 추가한다. HealthKit도 같은 방식(아이디어 노트 8번의 "네이티브 브릿지" 전제).
- 서버: **Supabase** — Auth(이메일/애플), Postgres + RLS(위 스키마), Storage(사진 썸네일, 비공개 버킷 + signed URL), Edge Function(LLM 호출·배치·푸시 발송).
- 대안(직접 제어): **Spring Boot 3 + PostgreSQL + Flyway**(같은 DDL을 V1__init.sql로), `@Scheduled` 배치, S3 presigned URL. 스키마·API 계약은 동일하므로 나중에 갈아타도 앱 코드는 그대로다.
- AI: 장면 JSON + 톤 프롬프트 → 서술. 서버에서만 호출하고 키는 앱에 넣지 않는다.

### 4.2 밤 인터뷰 생성 배치 (매 10분 tick)
1. `users`에서 `interview_enabled`이고 로컬 시각이 `interview_time`~`+10분` 구간에 든 사용자를 뽑는다.
2. 그 사용자의 오늘 `events`(`event_date = 로컬 오늘`, `deleted_at is null`)를 조회.
3. 하이라이트 점수 계산: 새 장소(최근 30일 방문 이력 없음) +2, 사진 5장 이상 +2, 캘린더 일정 매칭 +2, 평소와 다른 이동(주중/주말 패턴 이탈) +1, 반복 출퇴근 -3. 상위 1~3개만 `is_highlight=true`, `interview_state='pending'`.
4. 질문 생성: 활성 `style_profiles.interview_prompt` + 장면 요약(장소·시간·사진 수·날씨·함께한 인물) → 1문장. 없는 사실을 만들지 않도록 "제공된 정보 밖의 내용은 묻지 말라"를 프롬프트에 고정. 결과를 `events.interview_question`·`interview_asked_at`·`interview_state='asked'`로 저장.
5. Expo Push 발송(딥링크 `timeline://interview?eventId=...`). 무응답이고 `interview_reminder_time`이 지난 장면은 리마인드 1회만, 이후 `skipped`.
6. 멱등: 같은 장면·같은 날짜에 이미 `asked`면 건너뛴다. 배치가 두 번 돌아도 알림이 두 번 가지 않는다.

### 4.3 주간/월간 챕터 생성 배치
- 주간: 매주 월요일 00:20(사용자 로컬) 직전 주(월~일)를 대상. 월간: 매월 1일 00:40에 지난달. 구현은 4.2와 같은 tick 배치에서 "지난 기간 미생성 사용자"를 찾는 방식이 단순하다.
- 입력: 기간 내 `events`(답변 있는 장면 우선, 없으면 `auto_summary`), 인물(이름·관계·역할), 활성 톤 프롬프트, 기간의 날씨·BGM 요약.
- 출력 규칙: 사실 창작 금지, 인물은 `display_name`과 그 시점의 관계 라벨로만 호칭, 400~800자, 마지막에 다음 주로 이어지는 한 줄. 생성 후 인물명·날짜 검증(프롬프트에 넣은 id 외 이름이 나오면 재시도 1회, 실패 시 draft 유지).
- 저장: `chapters` insert(`status='draft'` → 홈 노출 시 `published`), `event_ids`는 서술 순서. 같은 주차 재실행은 `version+1`.
- 비용: 사용자당 주 1회 호출 + 월 1회. 입력은 `auto_summary` 위주로 잘라 장면 40개 이하로 제한.

### 4.4 API 계약 (REST, Supabase면 PostgREST로 대체 가능)
- `GET /me` · `PATCH /me`(알림 시각·톤 전환)
- `POST /events/sync` — 장면 배치 업로드. 본문은 `[{sourceType, sourceRef, startedAt, endedAt, location, lat, lng, rawSignals, autoSummary}]`. 응답은 upsert된 id 목록(중복은 기존 id 반환).
- `GET /events?from&to&personId&highlight` · `PATCH /events/{id}`(note·mood·visibility·인물 태그)
- `GET /interview/today` · `POST /interview/{eventId}/answer` · `POST /interview/{eventId}/skip`
- `GET /chapters?kind` · `GET /chapters/{id}` · `PATCH /chapters/{id}` · `POST /chapters/{id}/regenerate`
- `GET /persons` · `GET /persons/{id}/timeline` · `PATCH /persons/{id}`
- `GET /home` — 홈 1회 호출로 끝내는 집계 엔드포인트(장면·최신 챕터·1년 전·진행감).

### 4.5 동기화·프라이버시
- 기기 우선: 수집·요약은 기기에서 하고 서버에는 장면과 썸네일만 올린다. 원본 사진은 올리지 않는다(Storage에는 512px 썸네일, signed URL 1시간).
- `raw_signals`는 서버에서 30일 후 요약 컬럼만 남기고 정리하는 정책을 전제로 한다(결정 필요, 6번).
- RLS는 모든 테이블에서 소유자만 허용(스키마에 포함). 지인 공유가 붙을 때도 RLS를 넓히지 않고 Edge Function이 서비스 롤로 필요한 필드만 골라 응답하는 방식 — 이게 "덮어쓰지 않는 교차 타임라인"의 구현 지점이다.
- 위치 좌표는 장면 단위로만 저장하고 연속 동선은 저장하지 않는다(`lat/lng`는 장면 대표점 1개).

## 5. 2주 구현 순서 (2인 기준 제안)
1. 1~2일: Supabase 프로젝트 + DDL 적용 + RLS 확인(사용자 2명으로 교차 접근 차단 테스트).
2. 3~5일: Expo 셸 + 온보딩(톤·권한) + `POST /events/sync`로 오늘 장면 카드까지. 여기서 위치·사진 권한 거부 시나리오를 실제 기기로 확인.
3. 6~8일: 밤 인터뷰 배치·푸시·답변 저장. 하이라이트 점수는 규칙 기반으로 시작.
4. 9~11일: 주간 챕터 배치 + 리더 + 한 줄 수정.
5. 12~13일: 인물 목록·인물 타임라인(자동 태깅은 최근 인물 5명 원탭부터).
6. 14일: 실사용 1주 관찰용 계측(장면 수, 인터뷰 응답률, 챕터 열람 수).

## 6. 정해야 할 것 (구현 전에 결정하면 좋은 열린 항목)
- `raw_signals` 서버 보관 기간(30일 정리 vs 원본 유지) — 저장 비용과 "나중에 다시 써볼 여지"의 맞교환.
- 위치 권한 수준: '방문 감지'를 위해 iOS `Always`를 요구할지, '앱 사용 중'만으로 시작할지. 후자는 자동 수집 밀도가 크게 떨어진다.
- LLM 모델·비용 상한: 주간 1회 + 월간 1회 + 답변 요약만 호출하는 전제. 사용자 100명 기준 월 호출 수를 먼저 계산해 두는 편이 안전하다.
- 사진: 썸네일만 보관(권장) vs 원본 Storage 보관(추후 PDF 자서전 품질).

---

## 부록. DDL 초안 (전문)

> 같은 폴더 `timeline-mvp-schema.sql` 파일과 동일한 내용입니다. PostgreSQL 15 문법 기준으로 파싱 검증했으며, Supabase SQL Editor에 그대로 붙여 실행할 수 있습니다. Supabase가 아니면 `auth.users` 참조만 `users(id)` FK로 바꾸세요.

```sql
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
```
