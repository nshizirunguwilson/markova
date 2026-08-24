import { ReportsController } from './reports.controller';
import { VerifyController } from './verify.controller';
import { ReportsService } from './reports.service';
import { OwnershipService } from '../../common/ownership.service';
import {
  buildController,
  clearMocks,
  controllerHarness,
  mockService,
  parent,
  type RouteCase,
} from '../../test/controller';

/**
 * Report and ID card routes.
 *
 * The downloads are the ones worth reading carefully: a PDF or a CSV written
 * onto the response with the wrong headers arrives in a browser as a wall of
 * bytes rather than a file, and no service test would see it.
 */
describe('ReportsController', () => {
  const service = mockService([
    'getTermReportData',
    'generateTermReportHtml',
    'generateTermReportPdf',
    'generateClassReportCards',
    'getYearReportData',
    'generateDocument',
    'generateIdCardData',
    'generateBulkIdCards',
    'getIdCardRegistry',
    'issueIdCard',
    'issueBulkIdCards',
    'revokeIdCard',
    'suspendIdCard',
    'restoreIdCard',
    'exportDatasetCsv',
    'exportEverythingZip',
  ]);
  const ownership = mockService(['verifyStudentAccess']);

  let run: (c: RouteCase) => Promise<void>;

  const res = () => ({ set: jest.fn(), end: jest.fn() });

  beforeEach(async () => {
    clearMocks(service, ownership);
    service.generateTermReportPdf.mockResolvedValue(Buffer.from('%PDF-1.4'));
    service.exportDatasetCsv.mockResolvedValue({
      filename: 'students.csv',
      csv: 'a,b\n',
    });
    service.exportEverythingZip.mockResolvedValue(Buffer.from('PK'));
    run = await controllerHarness(ReportsController, [
      { token: ReportsService, name: 'service', mock: service },
      { token: OwnershipService, name: 'ownership', mock: ownership },
    ]);
  });

  const cases: RouteCase[] = [
    {
      name: 'the data behind a term report',
      call: (c) => c.getTermReport('student-1', 'term-1', parent),
      calls: 'getTermReportData',
      withArgs: ['student-1', 'term-1'],
    },
    {
      name: 'a term report as a page',
      call: (c) => c.getTermReportHtml('student-1', 'term-1', parent),
      calls: 'generateTermReportHtml',
      withArgs: ['student-1', 'term-1'],
    },
    {
      name: 'a whole class of report cards',
      call: (c) =>
        c.generateClassReports({
          classSectionId: 'section-1',
          termId: 'term-1',
        }),
      calls: 'generateClassReportCards',
      withArgs: ['section-1', 'term-1'],
    },
    {
      name: 'the data behind a year report',
      call: (c) => c.getYearReport('student-1', 'year-1', parent),
      calls: 'getYearReportData',
      withArgs: ['student-1', 'year-1'],
    },
    {
      name: 'a transfer letter or a transcript',
      call: (c) =>
        c.generateDocument({ studentId: 'student-1', type: 'transfer_letter' }),
      calls: 'generateDocument',
      withArgs: ['student-1', 'transfer_letter'],
    },
    {
      name: 'one ID card',
      call: (c) => c.getIdCard('student-1'),
      calls: 'generateIdCardData',
      withArgs: ['student-1'],
    },
    {
      name: 'a class of ID cards',
      call: (c) => c.bulkIdCards({ classSectionId: 'section-1' }),
      calls: 'generateBulkIdCards',
      withArgs: ['section-1'],
    },
    {
      name: 'the card register',
      call: (c) => c.idCardRegistry({ page: 2 }),
      calls: 'getIdCardRegistry',
      withArgs: [{ page: 2 }],
    },
    {
      name: 'a card issued',
      call: (c) => c.issueIdCard({ studentId: 'student-1' }),
      calls: 'issueIdCard',
      withArgs: ['student-1'],
    },
    {
      name: 'a class of cards issued',
      call: (c) => c.issueBulkIdCards({ classSectionId: 'section-1' }),
      calls: 'issueBulkIdCards',
      withArgs: ['section-1'],
    },
    {
      // Revoke and suspend are different acts on different service methods.
      // Wiring one to the other would destroy a code somebody meant to keep.
      name: 'a card revoked for good',
      call: (c) => c.revokeIdCard({ studentId: 'student-1' }),
      calls: 'revokeIdCard',
      withArgs: ['student-1'],
    },
    {
      name: 'a card suspended, not destroyed',
      call: (c) => c.suspendIdCard({ studentId: 'student-1' }),
      calls: 'suspendIdCard',
      withArgs: ['student-1'],
    },
    {
      name: 'a suspended card brought back',
      call: (c) => c.restoreIdCard({ studentId: 'student-1' }),
      calls: 'restoreIdCard',
      withArgs: ['student-1'],
    },
  ];

  it.each(cases)('$name', async (c) => {
    await run(c);
  });

  /**
   * Headers are the whole difference between a file a person can open and a
   * page of bytes.
   */
  describe('what is downloaded', () => {
    const build = () =>
      buildController(ReportsController, [
        { token: ReportsService, name: 'service', mock: service },
        { token: OwnershipService, name: 'ownership', mock: ownership },
      ]);

    it('sends a report card as a named PDF', async () => {
      const ctl: any = await build();
      const r = res();
      await ctl.getTermReportPdf('student-1', 'term-1', r, parent);
      expect(r.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Type': 'application/pdf',
          'Content-Disposition':
            'attachment; filename="report-card-student-1.pdf"',
          'Content-Length': 8,
        }),
      );
      expect(r.end).toHaveBeenCalledWith(Buffer.from('%PDF-1.4'));
    });

    it('checks whose student before writing a byte of the PDF', async () => {
      ownership.verifyStudentAccess.mockRejectedValueOnce(
        new Error('Forbidden'),
      );
      const ctl: any = await build();
      const r = res();
      await expect(
        ctl.getTermReportPdf('student-1', 'term-1', r, parent),
      ).rejects.toThrow();
      expect(service.generateTermReportPdf).not.toHaveBeenCalled();
      expect(r.end).not.toHaveBeenCalled();
    });

    it('sends one dataset under the name the service chose', async () => {
      const ctl: any = await build();
      const r = res();
      await ctl.exportDataset('students', r);
      expect(service.exportDatasetCsv).toHaveBeenCalledWith('students');
      expect(r.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="students.csv"',
        }),
      );
      expect(r.end).toHaveBeenCalledWith('a,b\n');
    });

    it('sends the whole export as a zip dated today', async () => {
      const ctl: any = await build();
      const r = res();
      await ctl.exportAll(r);
      const headers = r.set.mock.calls[0][0];
      expect(headers['Content-Type']).toBe('application/zip');
      expect(headers['Content-Disposition']).toMatch(
        /^attachment; filename="markova-export-\d{4}-\d{2}-\d{2}\.zip"$/,
      );
      expect(r.end).toHaveBeenCalledWith(Buffer.from('PK'));
    });
  });

  describe('every report naming a student checks whose it is', () => {
    it.each([
      ['the data', (c: any) => c.getTermReport('student-1', 't', parent)],
      ['the page', (c: any) => c.getTermReportHtml('student-1', 't', parent)],
      ['the year', (c: any) => c.getYearReport('student-1', 'y', parent)],
    ])('%s', async (_n, call) => {
      await run({
        name: 'checked',
        call,
        on: 'ownership',
        calls: 'verifyStudentAccess',
        withArgs: [parent.id, 'PARENT', 'student-1'],
      });
    });
  });
});

/**
 * Verification is public on purpose: somebody holding a printed card at a
 * gate has no account, and requiring one would make the QR decorative.
 */
describe('VerifyController', () => {
  const service = mockService(['verifyReportByCode', 'verifyCardByCode']);

  let run: (c: RouteCase) => Promise<void>;

  beforeEach(async () => {
    run = await controllerHarness(VerifyController, [
      { token: ReportsService, name: 'service', mock: service },
    ]);
  });

  it('looks up the report behind a printed code', async () => {
    await run({
      name: 'report',
      call: (c) => c.verify('482913756204'),
      calls: 'verifyReportByCode',
      withArgs: ['482913756204'],
    });
  });

  it('looks up the student behind a card code', async () => {
    await run({
      name: 'card',
      call: (c) => c.verifyCard('7HK2M9PQ'),
      calls: 'verifyCardByCode',
      withArgs: ['7HK2M9PQ'],
    });
  });
});
