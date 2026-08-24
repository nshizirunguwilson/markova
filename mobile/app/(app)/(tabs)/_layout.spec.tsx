import { waitFor } from '@testing-library/react-native';

import { defaultTheme } from '@/design/theme';
import { touch } from '@/design/tokens';
import { useChatStore } from '@/stores/chat-store';
import { givenApi } from '@/test/api-mock';
import {
  declaredScreens,
  inheritedOptions,
  visibleScreens,
} from '@/test/router-mock';
import {
  admin,
  librarian,
  matron,
  nurse,
  parent,
  renderScreen,
  resetHarness,
  signedInAs,
  teacher,
} from '@/test/harness';

import TabsLayout from './_layout';

/**
 * Four tabs and More, per role.
 *
 * Five is where a tab bar stops being scannable and starts being a menu, and
 * four of these roles need more than five destinations. So each role gets the
 * four places it actually goes during a week, and everything monthly lives
 * behind More.
 *
 * The test for a tab: used at least weekly by that role, and a place rather
 * than an action. Marks entry is the most used screen a teacher has and it is
 * still not a tab, because it is something you do to a class you picked, not
 * somewhere you go.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const initialChat = useChatStore.getState();

const tabsFor = async (user: Parameters<typeof signedInAs>[0]) => {
  signedInAs(user);
  await renderScreen(<TabsLayout />);
  return visibleScreens().map((s) => s.name);
};

const titlesFor = async (user: Parameters<typeof signedInAs>[0]) => {
  signedInAs(user);
  await renderScreen(<TabsLayout />);
  return visibleScreens().map((s) => s.options.title);
};

beforeEach(() => {
  resetHarness();
  useChatStore.setState({ ...initialChat, connect: jest.fn() as never }, true);
  givenApi({ '/notifications': [] });
});

describe('what each role sees on the bar', () => {
  it('gives an admin the school, its people and its academics', async () => {
    expect(await tabsFor(admin)).toEqual([
      'index',
      'people',
      'academics',
      'messages',
      'more',
    ]);
  });

  it('gives a teacher their classes and the register', async () => {
    expect(await tabsFor(teacher)).toEqual([
      'index',
      'classes',
      'attendance',
      'messages',
      'more',
    ]);
  });

  it('gives a parent their children and their alerts', async () => {
    expect(await tabsFor(parent)).toEqual([
      'index',
      'children',
      'messages',
      'alerts',
      'more',
    ]);
  });

  it('gives a librarian the catalogue and the desk', async () => {
    expect(await tabsFor(librarian)).toEqual([
      'index',
      'books',
      'circulate',
      'messages',
      'more',
    ]);
  });

  /**
   * Boarding staff live in the dormitory rather than at a desk. Money and the
   * sick bay are their week, and nothing academic appears at all: a matron has
   * no business reading marks.
   */
  it('gives a matron the money and the sick bay, and nothing academic', async () => {
    const tabs = await tabsFor(matron);

    expect(tabs).toEqual(['index', 'money', 'clinic', 'messages', 'more']);
    expect(tabs).not.toContain('academics');
    expect(tabs).not.toContain('classes');
  });

  // A nurse holds no money. Putting the counter in front of her would be a
  // tab she never presses.
  it('gives a nurse the sick bay but not the money', async () => {
    const tabs = await tabsFor(nurse);

    expect(tabs).toEqual(['index', 'clinic', 'messages', 'alerts', 'more']);
    expect(tabs).not.toContain('money');
  });

  it('gives a role it has never heard of the parent’s bar', async () => {
    expect(await tabsFor({ ...parent, role: 'GOVERNOR' as never })).toEqual([
      'index',
      'children',
      'messages',
      'alerts',
      'more',
    ]);
  });

  it('never puts more than five on the bar', async () => {
    for (const user of [admin, teacher, parent, librarian, matron, nurse]) {
      resetHarness();
      expect((await tabsFor(user)).length).toBeLessThanOrEqual(5);
    }
  });

  it('always starts at home and ends at More', async () => {
    for (const user of [admin, teacher, parent, librarian, matron, nurse]) {
      resetHarness();
      const tabs = await tabsFor(user);
      expect(tabs[0]).toBe('index');
      expect(tabs[tabs.length - 1]).toBe('more');
    }
  });
});

/**
 * A tab that is not on this role's bar is still a real route: it is hidden
 * rather than removed, so a screen can still push to it.
 */
describe('the tabs a role does not see', () => {
  it('are hidden rather than taken away', async () => {
    signedInAs(nurse);

    await renderScreen(<TabsLayout />);

    const hidden = declaredScreens.filter((s) => s.options.href === null);
    expect(hidden.map((s) => s.name)).toEqual(
      expect.arrayContaining(['people', 'academics', 'books', 'money']),
    );
    expect(declaredScreens).toHaveLength(13);
  });

  it('get no icon, since nothing draws them', async () => {
    signedInAs(nurse);

    await renderScreen(<TabsLayout />);

    for (const screen of declaredScreens.filter(
      (s) => s.options.href === null,
    )) {
      expect(screen.options.tabBarIcon).toBeUndefined();
    }
  });
});

describe('what the tabs are called', () => {
  it('calls the register the Register, not Attendance', async () => {
    expect(await titlesFor(teacher)).toEqual([
      'Home',
      'Classes',
      'Register',
      'Messages',
      'More',
    ]);
  });

  it('calls the circulation desk the Desk', async () => {
    expect(await titlesFor(librarian)).toContain('Desk');
  });
});

describe('the counts on the bar', () => {
  it('shows nothing when there is nothing waiting', async () => {
    signedInAs(teacher);

    await renderScreen(<TabsLayout />);

    const messages = visibleScreens().find((s) => s.name === 'messages');
    expect(messages!.options.tabBarBadge).toBeUndefined();
  });

  it('counts unread messages', async () => {
    useChatStore.setState({ unreadCount: 3 });
    signedInAs(teacher);

    await renderScreen(<TabsLayout />);

    const messages = visibleScreens().find((s) => s.name === 'messages');
    expect(messages!.options.tabBarBadge).toBe('3');
  });

  it('counts unread alerts separately from messages', async () => {
    givenApi({
      '/notifications': [{ isRead: false }, { isRead: true }, { isRead: false }],
    });
    signedInAs(parent);

    const screen = await renderScreen(<TabsLayout />);

    await waitFor(() => {
      const alerts = visibleScreens().find((s) => s.name === 'alerts');
      expect(alerts!.options.tabBarBadge).toBe('2');
    });
    expect(screen.toJSON()).toBeDefined();
  });

  // A three digit badge does not fit on a tab and stops being a number worth
  // reading anyway.
  it('stops counting past ninety-nine', async () => {
    useChatStore.setState({ unreadCount: 214 });
    signedInAs(teacher);

    await renderScreen(<TabsLayout />);

    const messages = visibleScreens().find((s) => s.name === 'messages');
    expect(messages!.options.tabBarBadge).toBe('99+');
  });

  it('draws the count in the critical colour so it reads as needing action', async () => {
    useChatStore.setState({ unreadCount: 1 });
    signedInAs(teacher);

    await renderScreen(<TabsLayout />);

    const messages = visibleScreens().find((s) => s.name === 'messages');
    expect(messages!.options.tabBarBadgeStyle).toMatchObject({
      backgroundColor: defaultTheme.status.critical.solid,
      color: '#FFFFFF',
    });
  });
});

describe('what the bar looks like', () => {
  it('sits on the page under a hairline rather than floating above it', async () => {
    signedInAs(teacher);

    await renderScreen(<TabsLayout />);
    const { tabBarStyle } = inheritedOptions() as {
      tabBarStyle: Record<string, number | string>;
    };

    expect(tabBarStyle.borderTopWidth).toBe(1);
    expect(tabBarStyle.borderTopColor).toBe(defaultTheme.line.hairline);
    expect(tabBarStyle.elevation).toBe(0);
  });

  it('is tall enough to hit every tab in it', async () => {
    signedInAs(teacher);

    await renderScreen(<TabsLayout />);
    const { tabBarStyle } = inheritedOptions() as {
      tabBarStyle: { height: number };
    };

    expect(tabBarStyle.height).toBeGreaterThan(touch.min);
  });

  it('tints the tab you are on with the school colour', async () => {
    signedInAs(teacher);

    await renderScreen(<TabsLayout />);

    expect(inheritedOptions().tabBarActiveTintColor).toBe(
      defaultTheme.brand.text,
    );
    expect(inheritedOptions().tabBarInactiveTintColor).toBe(
      defaultTheme.fg.tertiary,
    );
  });

  /**
   * Weight carries the active state as well as colour, so the bar still reads
   * for somebody who cannot tell the two tints apart.
   */
  it('thickens the icon you are on as well as tinting it', async () => {
    signedInAs(teacher);

    await renderScreen(<TabsLayout />);

    const icon = visibleScreens()[0].options.tabBarIcon as (props: {
      color: string;
      focused: boolean;
    }) => { props: { strokeWidth: number } };

    expect(icon({ color: '#000', focused: true }).props.strokeWidth).toBe(2.3);
    expect(icon({ color: '#000', focused: false }).props.strokeWidth).toBe(1.8);
  });
});

/**
 * Messaging is live, so the socket has to be open before somebody presses the
 * tab rather than after.
 */
describe('the socket behind the messages tab', () => {
  it('is opened as soon as the app has a bar to draw', async () => {
    signedInAs(teacher);

    await renderScreen(<TabsLayout />);

    expect(useChatStore.getState().connect).toHaveBeenCalled();
  });
});
