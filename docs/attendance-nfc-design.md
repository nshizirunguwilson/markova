# Attendance Feature Design - Mobile App

**Date**: 2026-03-22
**Status**: Approved

## Overview

Hybrid NFC + Manual List attendance for teachers on the mobile app. Uses existing student chip cards (NFC/RFID) already carried daily for canteen.

## Backend Changes

1. **Add `nfcCardId` to Student model** - nullable unique field storing raw NFC UID string
2. **`PATCH /api/users/students/:studentId/nfc-card`** (ADMIN, TEACHER) - Register NFC card
3. **`GET /api/attendance/class-students?classSectionId=X`** - Student list with nfcCardId for local cache
4. **`POST /api/attendance/nfc-scan`** - Match on nfcCardId instead of studentIdNumber

## Mobile Flow

### Two Modes
- **NFC Scan**: Teacher selects class → activates NFC → students tap cards → sound/haptic feedback → auto LATE after 8:30 AM → Done shows unscanned as ABSENT
- **Manual List**: All students default PRESENT → tap to cycle PRESENT/ABSENT/LATE → optional reason category → submit via bulk endpoint

### NFC Card Registration (one-time)
- Admin or teacher screen: select class → tap student name → tap card on phone → card UID linked to student

### Offline Support
- Cache class student list (with nfcCardIds) locally
- NFC scans match against local cache - no network needed
- Queue attendance records locally, sync when online

## Key Decisions
- Default status: PRESENT (mark exceptions)
- NFC format: raw UID string (works with any chip type)
- Late threshold: 8:30 AM (matches backend)
- Offline: queue + sync pattern
