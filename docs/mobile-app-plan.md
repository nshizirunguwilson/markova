# Plan: Markova Mobile App (React Native / Expo)

**Generated**: 2026-03-22
**Estimated Complexity**: High
**Framework**: React Native with Expo (managed workflow), TypeScript
**Location**: `/Users/wilson/Work/markova/mobile`

## Overview

Build a React Native mobile app for the Markova School Management System. The app consumes the existing NestJS backend API (`/api/*` endpoints + WebSocket `/chat` namespace). Primary users are **Parents** and **Students**, with **Teacher** and **Admin** as secondary. The app features real-time chat (WhatsApp-style), push notifications, offline marks entry, QR attendance scanning, and PDF report viewing.

## Prerequisites

- Node.js 18+
- Expo CLI (`npx expo`)
- Expo Go app on test device (or Android emulator / iOS simulator)
- Backend API running (local or production at 34.239.0.61)
- Firebase project for push notifications (created during Sprint 3)
- Apple Developer account ($99/year) for iOS App Store (later)
- Google Play Developer account ($25 one-time) for Play Store (later)

## Architecture Decisions

- **Navigation**: Expo Router (file-based routing, same pattern as Next.js App Router)
- **State Management**: Zustand (same as web app)
- **API Client**: Axios with interceptors (same pattern as web)
- **Data Fetching**: TanStack React Query v5 (same as web)
- **Real-time**: Socket.io-client (same as web)
- **Offline Storage**: expo-sqlite for offline marks queue
- **Push Notifications**: expo-notifications + Firebase Cloud Messaging
- **Styling**: NativeWind (Tailwind CSS for React Native) OR StyleSheet (decide in Sprint 1)
- **Camera/QR**: expo-camera for QR attendance scanning
- **PDF Viewing**: expo-web-browser (open PDF in system browser) or react-native-pdf

## Shared Code from Web App

These patterns will be **adapted** (not copy-pasted) from the web app:
- API interceptor logic (token injection, 401 auto-refresh)
- Auth store shape (Zustand)
- Chat store shape (Socket.io events)
- TypeScript interfaces/enums (Role, MessageStatus, etc.)
- React Query hook patterns (useMarks, useFees, etc.)

---

## Sprint 1: Project Setup + Auth Flow
**Goal**: Working login → OTP → dashboard navigation for all roles
**Duration**: 2-3 days

### Task 1.1: Initialize Expo Project
- **Description**: Create the Expo project with TypeScript template
- **Commands**:
  ```bash
  cd /Users/wilson/Work/markova
  npx create-expo-app mobile --template expo-template-blank-typescript
  ```
- **Dependencies**: None
- **Acceptance Criteria**:
  - `npx expo start` launches without errors
  - App shows on Expo Go or emulator
- **Validation**: Run `npx expo start`, see default screen

### Task 1.2: Install Core Dependencies
- **Description**: Install all core libraries needed across the app
- **Location**: `mobile/package.json`
- **Packages**:
  ```
  expo-router expo-linking expo-constants expo-status-bar
  @tanstack/react-query axios zustand
  socket.io-client
  expo-secure-store (token storage, replaces localStorage)
  expo-splash-screen
  react-native-safe-area-context react-native-screens
  lucide-react-native (icons, same as web)
  ```
- **Dependencies**: Task 1.1
- **Acceptance Criteria**: All packages install, app still builds
- **Validation**: `npx expo start` succeeds

### Task 1.3: Set Up Expo Router File Structure
- **Description**: Create the file-based routing structure
- **Location**: `mobile/app/`
- **Structure**:
  ```
  app/
    _layout.tsx              # Root layout (providers: QueryClient, AuthGuard)
    (auth)/
      _layout.tsx            # Auth layout (no nav bars)
      login.tsx              # Login screen
      verify-otp.tsx         # OTP verification screen
    (dashboard)/
      _layout.tsx            # Dashboard layout (tab navigator)
      (admin)/
        _layout.tsx          # Admin tab layout
        index.tsx            # Admin dashboard
      (teacher)/
        _layout.tsx
        index.tsx
      (student)/
        _layout.tsx
        index.tsx
      (parent)/
        _layout.tsx
        index.tsx
  ```
- **Dependencies**: Task 1.2
- **Acceptance Criteria**: Navigation between auth and dashboard works
- **Validation**: Tap through login → dashboard transition

### Task 1.4: Create API Client + Auth Store
- **Description**: Port the API client and auth store from web, adapted for React Native
- **Location**: `mobile/src/lib/api.ts`, `mobile/src/stores/auth-store.ts`
- **Key Differences from Web**:
  - Use `expo-secure-store` instead of `localStorage` for token storage
  - `SecureStore.getItemAsync()` / `setItemAsync()` (async, not sync)
  - Same axios interceptor pattern (inject Bearer token, auto-refresh on 401)
- **Dependencies**: Task 1.2
- **Acceptance Criteria**:
  - Tokens stored securely in device keychain
  - Auto-refresh on 401 works
  - Logout clears tokens
- **Validation**: Unit test or manual: login → close app → reopen → still authenticated

### Task 1.5: Build Login Screen
- **Description**: Email/phone + password login form with validation
- **Location**: `mobile/app/(auth)/login.tsx`
- **Features**:
  - Email/phone input with keyboard type switching
  - Password input with show/hide toggle
  - "Sign In" button with loading state
  - Error display (wrong password, locked account, network error)
  - "Forgot password?" link
  - Markova branding (logo, blue theme #1B4F72)
- **Dependencies**: Task 1.4
- **Acceptance Criteria**:
  - Student login → direct to dashboard
  - Admin/Teacher/Parent login → navigate to OTP screen
  - Wrong password → error toast
  - Locked account → "Account locked" message
- **Validation**: Login with test credentials against running backend

### Task 1.6: Build OTP Verification Screen
- **Description**: 6-digit OTP input for non-student roles
- **Location**: `mobile/app/(auth)/verify-otp.tsx`
- **Features**:
  - 6 individual digit inputs (auto-focus next on input)
  - Auto-submit when all 6 digits entered
  - "Resend OTP" button with 60s cooldown timer
  - Session timeout handling (5 min)
- **Dependencies**: Task 1.5
- **Acceptance Criteria**:
  - Correct OTP → navigate to role-appropriate dashboard
  - Wrong OTP → error, input cleared
  - Expired OTP → "Session expired, please login again"
- **Validation**: Full login + OTP flow against backend

### Task 1.7: Role-Based Navigation (Tab Bars)
- **Description**: Create bottom tab navigators for each role
- **Location**: `mobile/app/(dashboard)/(parent)/_layout.tsx`, etc.
- **Tab Structure**:
  - **Parent**: Home | Marks | Attendance | Fees | Messages
  - **Student**: Home | Marks | Homework | Attendance | Messages
  - **Teacher**: Home | Marks | Attendance | Homework | Messages
  - **Admin**: Home | Users | Messages | Settings
- **Dependencies**: Task 1.3, 1.6
- **Acceptance Criteria**: Role-appropriate tabs show after login
- **Validation**: Login as different roles, verify correct tabs

### Task 1.8: Create Shared UI Components
- **Description**: Build reusable components matching the web app's design language
- **Location**: `mobile/src/components/ui/`
- **Components**:
  - `Button` (primary, outline, danger, ghost variants + loading state)
  - `Card` (container with shadow/border)
  - `Badge` (colored status badges)
  - `Spinner` (loading indicator)
  - `Avatar` (photo with fallback initials)
  - `Modal` (bottom sheet or centered modal)
  - `Input` (text input with label, error, icon support)
  - `Toast` (success/error notifications)
- **Dependencies**: Task 1.2
- **Acceptance Criteria**: Components render correctly on iOS and Android
- **Validation**: Visual check on both platforms

**Sprint 1 Demo/Validation**:
- [ ] App installs on device/emulator
- [ ] Login as Student → goes directly to Student dashboard
- [ ] Login as Admin → OTP screen → enters OTP → Admin dashboard
- [ ] Login as Parent → OTP → Parent dashboard with correct tabs
- [ ] Wrong password shows error
- [ ] Token persists across app restarts
- [ ] Logout clears session

---

## Sprint 2: Parent + Student Core Screens
**Goal**: Parents can view their children's marks, attendance, fees. Students can view their own.
**Duration**: 3-4 days

### Task 2.1: Create React Query Hooks
- **Description**: Port all data-fetching hooks from web, adapted for React Native
- **Location**: `mobile/src/hooks/`
- **Files**:
  - `use-academic.ts` (years, terms, classes)
  - `use-marks.ts` (term results, year results, report card)
  - `use-attendance.ts` (student summary, dashboard)
  - `use-fees.ts` (student fees, summary)
  - `use-homework.ts` (student homework, submissions)
  - `use-users.ts` (user search, profile)
  - `use-messaging.ts` (conversations, messages)
  - `use-notifications.ts` (notification list, unread count)
  - `use-reports.ts` (report card data)
  - `use-discipline.ts` (student discipline)
  - `use-library.ts` (student loans)
- **Dependencies**: Task 1.4
- **Acceptance Criteria**: All hooks fetch data from API correctly
- **Validation**: Console log API responses for each hook

### Task 2.2: Parent Dashboard Screen
- **Description**: Overview of all children with key stats
- **Location**: `mobile/app/(dashboard)/(parent)/index.tsx`
- **Features**:
  - Child selector (if multiple children)
  - Attendance rate card (this term)
  - Latest marks summary (last 3 subjects)
  - Fee balance card
  - Recent notifications
  - Quick action buttons (View Marks, View Fees, etc.)
- **Dependencies**: Task 2.1
- **Acceptance Criteria**: Shows real data for linked children
- **Validation**: Login as parent, verify data matches web dashboard

### Task 2.3: Marks Screen (Parent + Student)
- **Description**: View term results and subject breakdown
- **Location**: `mobile/app/(dashboard)/(parent)/marks.tsx`, `mobile/app/(dashboard)/(student)/marks.tsx`
- **Features**:
  - Term/Year selector dropdown
  - Subject list with grades, averages, ranks
  - Performance bar chart (simple bar visualization)
  - Grade legend (A=80+, B=70+, etc.)
  - Child selector (parent only)
  - Pull-to-refresh
- **Dependencies**: Task 2.1
- **Acceptance Criteria**: Marks display correctly with proper grades
- **Validation**: Compare with web marks page for same student

### Task 2.4: Attendance Screen (Parent + Student)
- **Description**: Calendar view + summary stats
- **Location**: `mobile/app/(dashboard)/(parent)/attendance.tsx`, `mobile/app/(dashboard)/(student)/attendance.tsx`
- **Features**:
  - Month calendar with colored dots (green=present, red=absent, yellow=late)
  - Month navigation (prev/next)
  - Summary stats: total days, present, absent, late, rate%
  - Child selector (parent only)
- **Dependencies**: Task 2.1
- **Acceptance Criteria**: Calendar shows correct attendance data
- **Validation**: Compare with web attendance page

### Task 2.5: Fees Screen (Parent)
- **Description**: View fee records and payment status
- **Location**: `mobile/app/(dashboard)/(parent)/fees.tsx`
- **Features**:
  - Total balance card (prominent, red if outstanding)
  - Fee records list by term (PAID/PARTIAL/UNPAID badges)
  - Receipt download button (opens PDF in browser)
  - Payment method shown
  - Child selector (if multiple children)
- **Dependencies**: Task 2.1
- **Acceptance Criteria**: Fee data matches web, receipt PDF opens
- **Validation**: Login as parent, check fee records

### Task 2.6: Student Dashboard Screen
- **Description**: Student's personal overview
- **Location**: `mobile/app/(dashboard)/(student)/index.tsx`
- **Features**:
  - Attendance rate this term
  - Latest marks (last 3 subjects with grades)
  - Upcoming homework (due dates)
  - Library loans (if any overdue)
  - Quick actions
- **Dependencies**: Task 2.1
- **Acceptance Criteria**: Shows correct data for logged-in student
- **Validation**: Login as student, verify data

### Task 2.7: Homework Screen (Student)
- **Description**: View assigned homework and submission status
- **Location**: `mobile/app/(dashboard)/(student)/homework.tsx`
- **Features**:
  - List of homework assignments (title, subject, due date)
  - Status badges (PENDING, SUBMITTED, GRADED)
  - Due date countdown
  - Expandable detail view
- **Dependencies**: Task 2.1
- **Acceptance Criteria**: Shows homework for student's class
- **Validation**: Compare with web homework page

### Task 2.8: Report Card / PDF Viewer
- **Description**: View and download report card
- **Location**: `mobile/app/(dashboard)/(parent)/reports.tsx`, `mobile/app/(dashboard)/(student)/reports.tsx`
- **Features**:
  - Term/Year selector
  - Report card summary (inline view with subjects, grades, teacher comments)
  - "Download PDF" button → opens in system browser or PDF viewer
  - Child selector (parent only)
- **Dependencies**: Task 2.1
- **Acceptance Criteria**: Report data displays, PDF downloads
- **Validation**: View report card, download PDF

### Task 2.9: Profile Screen
- **Description**: View/edit profile, change password
- **Location**: `mobile/app/(dashboard)/profile.tsx` (shared across roles)
- **Features**:
  - Avatar with photo upload (camera or gallery)
  - Name, email, phone display
  - Change password form
  - Active sessions list
  - Logout button (with confirmation modal)
  - App version display
- **Dependencies**: Task 2.1
- **Acceptance Criteria**: Profile displays, photo upload works, password change works
- **Validation**: Upload photo, change password, verify on web

**Sprint 2 Demo/Validation**:
- [ ] Parent sees all children's data (marks, attendance, fees)
- [ ] Student sees own marks, homework, attendance
- [ ] Calendar attendance view works with month navigation
- [ ] Fee records show correct balances and statuses
- [ ] Report card PDF opens in browser
- [ ] Pull-to-refresh works on all list screens
- [ ] Profile photo upload works

---

## Sprint 3: Real-Time Chat + Push Notifications
**Goal**: Full WhatsApp-style messaging with push notifications
**Duration**: 3-4 days

### Task 3.1: Create Chat Store (WebSocket)
- **Description**: Port chat store from web, adapted for React Native
- **Location**: `mobile/src/stores/chat-store.ts`
- **Features**:
  - Socket.io connection with auto-reconnect
  - Online/offline user tracking
  - Typing indicators (Map per conversation)
  - Message delivery status tracking (SENT → DELIVERED → READ)
  - Optimistic message sending
  - Background reconnection on app resume (AppState listener)
- **Dependencies**: Task 1.4
- **Acceptance Criteria**: WebSocket connects, receives messages
- **Validation**: Send message from web, receive on mobile

### Task 3.2: Conversations List Screen
- **Description**: List all conversations with last message preview
- **Location**: `mobile/app/(dashboard)/messages/index.tsx`
- **Features**:
  - Conversation list sorted by last message time
  - Online indicator (green dot for ONE_ON_ONE)
  - Unread count badge
  - Last message preview (sender + text truncated)
  - "New conversation" FAB button
  - Search/filter conversations
  - Pull-to-refresh
- **Dependencies**: Task 3.1, 2.1
- **Acceptance Criteria**: Shows all conversations with real-time updates
- **Validation**: Send message from web, verify it appears in list

### Task 3.3: Chat Screen
- **Description**: Individual conversation view with full messaging
- **Location**: `mobile/app/(dashboard)/messages/[conversationId].tsx`
- **Features**:
  - Message bubbles (blue for sent, gray for received)
  - Sender name + avatar for group chats
  - Timestamp on each message
  - WhatsApp-style ticks: ✓ sent, ✓✓ delivered, ✓✓ blue = read
  - Typing indicator ("John is typing...")
  - Online status in header ("online" / "last seen 5m ago")
  - Auto-scroll to bottom on new message
  - Text input with send button
  - Keyboard-aware scroll (messages don't hide behind keyboard)
  - FlatList with inverted rendering for performance
- **Dependencies**: Task 3.1
- **Acceptance Criteria**: Real-time messaging works between web and mobile
- **Validation**: Two-way chat between web and mobile, verify ticks update

### Task 3.4: New Conversation Screen
- **Description**: Create new direct message or group conversation
- **Location**: `mobile/app/(dashboard)/messages/new.tsx`
- **Features**:
  - User search (debounced, uses `/api/users` with search param)
  - User list with avatar, name, role badge
  - Type selector (Direct Message / Group / Broadcast)
  - Group name input (for group/broadcast)
  - Selected users chips with remove
  - Create button
- **Dependencies**: Task 3.2
- **Acceptance Criteria**: Can create conversation and immediately chat
- **Validation**: Create DM from mobile, verify on web

### Task 3.5: Set Up Firebase Cloud Messaging
- **Description**: Configure push notifications
- **Steps**:
  1. Create Firebase project (firebase.google.com)
  2. Add Android app (package name: `com.markova.school`)
  3. Add iOS app (bundle ID: `com.markova.school`)
  4. Download `google-services.json` (Android) and `GoogleService-Info.plist` (iOS)
  5. Install `expo-notifications` and configure in `app.json`
  6. Register device push token on login
- **Location**: `mobile/app.json`, `mobile/src/lib/notifications.ts`
- **Dependencies**: Task 1.4
- **Acceptance Criteria**: Device receives push token
- **Validation**: Log push token to console

### Task 3.6: Push Notification Handler
- **Description**: Handle incoming push notifications
- **Location**: `mobile/src/lib/notifications.ts`
- **Features**:
  - Register push token with backend on login (`POST /api/users/:id/push-token`)
  - Handle notification tap → navigate to relevant screen
  - Display notification badge on app icon
  - Background notification handling
  - Notification categories:
    - New message → open chat
    - Attendance alert → open attendance
    - Fee reminder → open fees
    - Mark published → open marks
- **Dependencies**: Task 3.5
- **Acceptance Criteria**: Push notifications arrive and tapping opens correct screen
- **Validation**: Trigger notification from backend, verify on device

### Task 3.7: Backend Push Token Endpoint
- **Description**: Add endpoint to store/update device push tokens
- **Location**: `/Users/wilson/Work/markova/backend/src/modules/users/users.controller.ts`
- **Endpoint**: `POST /api/users/:id/push-token`
- **Body**: `{ token: string, platform: 'ios' | 'android' }`
- **Schema Change**: Add `pushToken` and `pushPlatform` fields to User model (or separate DeviceToken table)
- **Dependencies**: None (backend change)
- **Acceptance Criteria**: Push token stored in database
- **Validation**: Call endpoint, verify in DB

### Task 3.8: Backend Push Notification Sending
- **Description**: Send Firebase push notifications from NotificationsService
- **Location**: `/Users/wilson/Work/markova/backend/src/modules/notifications/notifications.service.ts`
- **Features**:
  - Install `firebase-admin` package
  - Initialize Firebase Admin SDK with service account
  - Implement `sendPush()` method
  - Send push on: new message, attendance alert, fee reminder, result published
- **Dependencies**: Task 3.7
- **Acceptance Criteria**: Push notifications sent from backend
- **Validation**: Trigger event, receive push on device

**Sprint 3 Demo/Validation**:
- [ ] Open chat → send message → appears on web instantly
- [ ] Receive message from web → appears on mobile instantly
- [ ] Ticks update: ✓ → ✓✓ → blue ✓✓
- [ ] Typing indicator shows when other user types
- [ ] Online/offline status shows correctly
- [ ] Push notification received when app is backgrounded
- [ ] Tapping push notification opens correct screen
- [ ] Create new DM from mobile, chat works immediately

---

## Sprint 4: Teacher Features
**Goal**: Teachers can enter marks, take attendance, manage homework from mobile
**Duration**: 2-3 days

### Task 4.1: Teacher Dashboard
- **Description**: Teacher's daily overview
- **Location**: `mobile/app/(dashboard)/(teacher)/index.tsx`
- **Features**:
  - Today's classes from timetable
  - Quick action buttons (Take Attendance, Enter Marks)
  - Recent activity feed
  - Pending homework submissions count
- **Dependencies**: Task 2.1
- **Acceptance Criteria**: Shows teacher's assigned classes and schedule
- **Validation**: Login as teacher, verify data

### Task 4.2: Marks Entry Screen
- **Description**: Enter/edit marks for a class
- **Location**: `mobile/app/(dashboard)/(teacher)/marks.tsx`
- **Features**:
  - Class → Subject → Assessment Type selector cascade
  - Student list with score input fields (numeric keyboard)
  - Max score display and validation
  - Batch save button
  - "Save offline" indicator when no network
- **Dependencies**: Task 2.1
- **Acceptance Criteria**: Marks saved to API, appear on student's view
- **Validation**: Enter marks on mobile, verify on web as admin

### Task 4.3: Offline Marks Queue
- **Description**: Save marks locally when offline, sync when back online
- **Location**: `mobile/src/lib/offline-db.ts`
- **Features**:
  - Use `expo-sqlite` to store pending marks
  - Queue structure: `{ id, studentId, subjectId, assessmentTypeId, termId, score, maxScore, savedAt }`
  - Auto-sync on network restore (NetInfo listener)
  - Sync progress indicator ("Syncing 5 marks...")
  - Conflict resolution: server wins if mark already exists
  - Badge showing pending count
- **Dependencies**: Task 4.2
- **Acceptance Criteria**: Enter marks offline → go online → marks sync
- **Validation**: Turn off WiFi, enter marks, turn on WiFi, verify sync

### Task 4.4: Attendance Marking Screen
- **Description**: Mark class attendance for today
- **Location**: `mobile/app/(dashboard)/(teacher)/attendance.tsx`
- **Features**:
  - Class/section selector
  - Student list with toggle buttons (PRESENT / ABSENT / LATE)
  - "Mark All Present" quick action
  - Submit button with confirmation
  - Today's date prominently displayed
- **Dependencies**: Task 2.1
- **Acceptance Criteria**: Attendance saved, shows on admin dashboard
- **Validation**: Mark attendance, verify on web

### Task 4.5: QR Attendance Scanner
- **Description**: Scan student QR codes for quick attendance
- **Location**: `mobile/app/(dashboard)/(teacher)/qr-scan.tsx`
- **Features**:
  - Camera view with QR overlay frame
  - Scan student QR code → auto-mark PRESENT
  - Sound/vibration feedback on successful scan
  - Duplicate detection ("Already scanned")
  - Scanned student count display
  - Class selector (which class is being scanned)
- **Dependencies**: Install `expo-camera`, `expo-haptics`
- **Acceptance Criteria**: QR scan creates attendance record
- **Validation**: Generate test QR code, scan it, verify attendance marked

### Task 4.6: Teacher Homework Screen
- **Description**: Create homework and view submissions
- **Location**: `mobile/app/(dashboard)/(teacher)/homework.tsx`
- **Features**:
  - Homework list (title, class, due date, submission count)
  - Create homework form (title, description, due date, class)
  - View submissions list with grading
  - Grade submission with score + comment
- **Dependencies**: Task 2.1
- **Acceptance Criteria**: Create homework from mobile, students see it
- **Validation**: Create homework, login as student, verify it appears

### Task 4.7: Discipline Reporting
- **Description**: Report discipline incidents from mobile
- **Location**: `mobile/app/(dashboard)/(teacher)/discipline.tsx`
- **Features**:
  - "Report Incident" button
  - Student search/select
  - Incident type, severity, description
  - Points deduction
  - Submit with confirmation
- **Dependencies**: Task 2.1
- **Acceptance Criteria**: Incident created, appears on admin dashboard
- **Validation**: Create incident, verify on web

**Sprint 4 Demo/Validation**:
- [ ] Teacher enters marks for a class → saved to API
- [ ] Enter marks offline → sync when online
- [ ] Take attendance for a class → shows on admin dashboard
- [ ] QR scan marks student present
- [ ] Create homework → student sees it
- [ ] Report discipline incident → admin sees it

---

## Sprint 5: Admin Features + Polish
**Goal**: Admin quick actions on mobile, app-wide polish, store preparation
**Duration**: 2-3 days

### Task 5.1: Admin Dashboard (Mobile)
- **Description**: Key stats and quick actions for admin
- **Location**: `mobile/app/(dashboard)/(admin)/index.tsx`
- **Features**:
  - Student/teacher/class counts
  - Today's attendance rate
  - Fee collection rate
  - Quick actions: Send Notification, View Reports
  - Recent alerts
- **Dependencies**: Task 2.1
- **Acceptance Criteria**: Dashboard shows accurate stats
- **Validation**: Compare with web admin dashboard

### Task 5.2: Admin User List (Mobile)
- **Description**: Browse and search users
- **Location**: `mobile/app/(dashboard)/(admin)/users.tsx`
- **Features**:
  - Searchable user list with role filter
  - User detail view (name, role, contact, last login)
  - Quick actions: call, email, deactivate
  - Pull-to-refresh + infinite scroll pagination
- **Dependencies**: Task 2.1
- **Acceptance Criteria**: User list loads with pagination
- **Validation**: Search for user, verify results

### Task 5.3: Notification Sending (Admin)
- **Description**: Send notifications/announcements from mobile
- **Location**: `mobile/app/(dashboard)/(admin)/send-notification.tsx`
- **Features**:
  - Recipient selector (all parents, all teachers, specific class, specific user)
  - Title + message input
  - Channel selector (Email, Push, SMS)
  - Send with confirmation
- **Dependencies**: Task 2.1
- **Acceptance Criteria**: Notification sent and received by targets
- **Validation**: Send to self, verify receipt

### Task 5.4: App-Wide Error Boundaries
- **Description**: Add error handling throughout the app
- **Location**: `mobile/src/components/error-boundary.tsx`
- **Features**:
  - Catch rendering errors → show "Something went wrong" with retry
  - Network error detection → show offline banner
  - Session expired → redirect to login with message
  - API error toasts (using react-native-toast-message or similar)
- **Dependencies**: All screens
- **Acceptance Criteria**: App never crashes to white screen
- **Validation**: Simulate network error, API error, render error

### Task 5.5: Deep Linking
- **Description**: Handle notification deep links and universal links
- **Location**: `mobile/app.json`, `mobile/app/_layout.tsx`
- **Features**:
  - `markova://messages/:conversationId` → open chat
  - `markova://marks` → open marks screen
  - `markova://attendance` → open attendance
  - Handle links from push notifications
- **Dependencies**: Task 3.6
- **Acceptance Criteria**: Tapping notification opens correct screen
- **Validation**: Send push with deep link, verify navigation

### Task 5.6: App Theming + Splash Screen
- **Description**: Consistent Markova branding
- **Location**: `mobile/app.json`, `mobile/src/theme/`
- **Features**:
  - Splash screen with Markova logo (blue #1B4F72 background)
  - App icon (Markova "M" shield logo)
  - Color theme matching web (primary, secondary, accent)
  - Light mode only (no dark mode for v1)
  - Status bar styling per screen
- **Dependencies**: None
- **Acceptance Criteria**: App looks branded and professional
- **Validation**: Visual check on iOS and Android

### Task 5.7: Performance Optimization
- **Description**: Optimize for production
- **Features**:
  - FlatList with `getItemLayout` for fixed-height rows
  - Image caching for avatars (expo-image)
  - React Query stale/cache time tuning
  - Lazy loading of non-critical screens
  - Memory leak prevention (cleanup socket listeners)
  - List virtualization for long lists (marks, users)
- **Dependencies**: All screens
- **Acceptance Criteria**: App feels smooth, no jank
- **Validation**: Profile with Flipper or React DevTools

### Task 5.8: Build Configuration + Store Assets
- **Description**: Prepare for App Store and Play Store submission
- **Location**: `mobile/app.json`, `mobile/eas.json`
- **Features**:
  - EAS Build configuration (development, preview, production)
  - Android: signing keystore generation
  - iOS: provisioning profile setup
  - Store screenshots (phone + tablet sizes)
  - App Store description and metadata
  - Privacy policy URL
- **Dependencies**: All features complete
- **Acceptance Criteria**: `eas build --platform all` succeeds
- **Validation**: Install production build on device

**Sprint 5 Demo/Validation**:
- [ ] Admin sees dashboard stats on mobile
- [ ] Admin can search/view users
- [ ] Admin can send notifications
- [ ] App handles errors gracefully (no crashes)
- [ ] Push notifications deep link to correct screens
- [ ] App branding is consistent (splash, icons, colors)
- [ ] Production build installs and works on both platforms

---

## Testing Strategy

### Per Sprint
- Manual testing on both iOS and Android (Expo Go or builds)
- Cross-role testing: login as each role, verify correct screens
- Network testing: airplane mode for offline features, slow 3G for loading states
- Compare data accuracy with web app

### Before Store Submission
- Full regression test across all roles
- Test on at least 3 Android devices (different screen sizes)
- Test on at least 2 iOS devices (iPhone SE + iPhone 14+)
- Performance profiling (no frame drops below 30fps)
- Memory leak testing (navigate extensively, check memory)
- Push notification testing (foreground, background, killed state)
- Deep link testing from notifications

---

## Potential Risks & Gotchas

1. **expo-secure-store is async** - Unlike localStorage, token reads are async. Must handle this in the API interceptor (await the token before each request). May need a token cache in memory.

2. **Socket.io reconnection on app resume** - React Native's AppState changes when app goes to background. Must reconnect socket on `active` state, disconnect on `background` to save battery.

3. **Keyboard handling in chat** - The message input must stay visible above keyboard. Use `KeyboardAvoidingView` with correct behavior per platform (`padding` on iOS, `height` on Android).

4. **iOS push notifications require Apple Developer account** - Can't test real push on iOS without it. Use Expo's push notification testing tool during development.

5. **Large image uploads on mobile data** - Profile photo uploads should compress images before upload. Use `expo-image-manipulator` to resize to max 800px and compress quality to 80%.

6. **Android back button** - Must handle hardware back button correctly in modals, chat screens, and nested navigation.

7. **Offline marks sync conflicts** - If a teacher enters marks offline and an admin also enters marks on web, the sync needs conflict resolution. Current plan: server wins (overwrite local).

8. **QR code format** - Must agree on QR code content format with backend. Suggest: `markova:student:{studentId}` as the QR payload.

9. **Expo Go limitations** - Some features (push notifications, camera in production mode) require a development build, not Expo Go. Plan for `eas build --profile development` early.

10. **API URL in production** - The mobile app needs the production API URL baked into the build (or configurable). Use `expo-constants` to manage environment-specific config.

---

## File Structure Summary

```
mobile/
  app/
    _layout.tsx
    (auth)/
      _layout.tsx
      login.tsx
      verify-otp.tsx
      forgot-password.tsx
    (dashboard)/
      _layout.tsx
      profile.tsx
      messages/
        index.tsx
        [conversationId].tsx
        new.tsx
      (parent)/
        _layout.tsx
        index.tsx
        marks.tsx
        attendance.tsx
        fees.tsx
        reports.tsx
        discipline.tsx
      (student)/
        _layout.tsx
        index.tsx
        marks.tsx
        attendance.tsx
        homework.tsx
        library.tsx
        reports.tsx
      (teacher)/
        _layout.tsx
        index.tsx
        marks.tsx
        attendance.tsx
        qr-scan.tsx
        homework.tsx
        discipline.tsx
      (admin)/
        _layout.tsx
        index.tsx
        users.tsx
        send-notification.tsx
  src/
    components/
      ui/
        button.tsx
        card.tsx
        badge.tsx
        spinner.tsx
        avatar.tsx
        modal.tsx
        input.tsx
        toast.tsx
    hooks/
      use-academic.ts
      use-marks.ts
      use-attendance.ts
      use-fees.ts
      use-homework.ts
      use-messaging.ts
      use-notifications.ts
      use-users.ts
      use-reports.ts
      use-discipline.ts
      use-library.ts
    stores/
      auth-store.ts
      chat-store.ts
    lib/
      api.ts
      notifications.ts
      offline-db.ts
    theme/
      colors.ts
      typography.ts
    types/
      index.ts
  assets/
    icon.png
    splash.png
    adaptive-icon.png
```
