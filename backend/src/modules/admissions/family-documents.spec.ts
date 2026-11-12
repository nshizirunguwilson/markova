import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AdmissionsService } from './admissions.service';
import { accountsFor } from '../../__test__/accounts';

/**
 * A family attaching papers to an application.
 *
 * The finding: no route took a file, the form said the school would ask
 * later, and every document in the database came from the seed.
 */
describe('a family attaching a document', () => {
  let root: string;
  const prisma: any = {
    application: { findUnique: jest.fn() },
    applicationDocument: { count: jest.fn(), create: jest.fn() },
    account: { findMany: jest.fn(), create: jest.fn() },
  };
  const service = new AdmissionsService(prisma, accountsFor(prisma));

  const application = (over: object = {}) => ({
    id: 'app-1',
    reference: 'APP-2026-0417',
    status: 'INFO_REQUESTED',
    dateOfBirth: new Date('2013-04-02'),
    intake: {},
    ...over,
  });
  const pdf = (size = 2048) => ({
    buffer: Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(size)]),
    mimetype: 'application/pdf',
    originalname: '../../Birth certificate, Keza.pdf',
    size,
  });
  const send = (file = pdf(), dob = '2013-04-02') =>
    service.attachFromFamily(
      'app-2026-0417',
      dob,
      'BIRTH_CERTIFICATE',
      file,
      'school-1',
    );

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'markova-admissions-'));
    process.env.UPLOAD_DIR = root;
    jest.clearAllMocks();
    prisma.application.findUnique.mockResolvedValue(application());
    prisma.applicationDocument.count.mockResolvedValue(2);
    prisma.applicationDocument.create.mockImplementation(({ data }: any) => ({
      id: 'doc-1',
      uploadedAt: new Date(),
      ...data,
    }));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    delete process.env.UPLOAD_DIR;
  });

  const stored = () => {
    const dir = join(root, 'schools', 'school-1', 'admissions');
    return existsSync(dir) ? readdirSync(dir) : [];
  };

  it("stores the file in the school's admissions folder and records it", async () => {
    const out = await send();
    expect(stored()).toHaveLength(1);
    const data = prisma.applicationDocument.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      applicationId: 'app-1',
      kind: 'BIRTH_CERTIFICATE',
    });
    expect(data.fileUrl).toMatch(
      /^\/uploads\/schools\/school-1\/admissions\/[0-9a-f-]+\.pdf$/,
    );
    expect(out.label).toBeTruthy();
  });

  it('keeps the name the office sees free of any path', async () => {
    await send();
    expect(
      prisma.applicationDocument.create.mock.calls[0][0].data.fileName,
    ).toBe('Birth certificate Keza.pdf');
  });

  it('names a file that came without a usable name', async () => {
    await send({ ...pdf(), originalname: '' });
    await send({ ...pdf(), originalname: '###.pdf' });
    const names = prisma.applicationDocument.create.mock.calls.map(
      (c: any) => c[0].data.fileName,
    );
    expect(names).toEqual(['document.pdf', 'document.pdf']);
  });

  it('takes a photograph as well as a PDF', async () => {
    const png = {
      buffer: Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0,
      ]),
      mimetype: 'image/png',
      originalname: 'photo.png',
      size: 10,
    };
    await send(png);
    expect(stored()[0]).toMatch(/\.png$/);
  });

  // A wrong guess must leave nothing behind.
  it('writes nothing when the date of birth is wrong', async () => {
    await expect(send(pdf(), '2013-04-03')).rejects.toThrow();
    expect(stored()).toHaveLength(0);
    expect(prisma.applicationDocument.create).not.toHaveBeenCalled();
  });

  it('refuses a file that only claims to be a PDF', async () => {
    const fake = { ...pdf(), buffer: Buffer.from('<html><script>') };
    await expect(send(fake)).rejects.toThrow('Send a PDF or a photograph');
    expect(stored()).toHaveLength(0);
  });

  it('refuses a kind of file it does not take', async () => {
    const doc = { ...pdf(), mimetype: 'application/msword' };
    await expect(send(doc)).rejects.toThrow('Send a PDF or a photograph');
  });

  it('refuses a file over 5 MB', async () => {
    await expect(send(pdf(5 * 1024 * 1024 + 1))).rejects.toThrow('over 5 MB');
  });

  it('stops at fifteen documents an application', async () => {
    prisma.applicationDocument.count.mockResolvedValue(15);
    await expect(send()).rejects.toThrow('at most 15 documents');
  });

  it('refuses an application that is closed', async () => {
    prisma.application.findUnique.mockResolvedValue(
      application({ status: 'ENROLLED' }),
    );
    await expect(send()).rejects.toThrow('closed');
  });
});
