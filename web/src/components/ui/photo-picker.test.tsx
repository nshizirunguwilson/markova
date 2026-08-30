import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

import {
  MAX_PHOTO_BYTES,
  PhotoPicker,
  refusePhoto,
  sizeLabel,
} from "./photo-picker";

/**
 * Choosing a profile photograph.
 *
 * The frame is round and crops to the centre, and a photograph taken on a
 * phone almost never is - so what is held here is that somebody sees the
 * picture in the frame it will actually appear in before anything is sent.
 * The alternative is finding out from the topbar that the school now holds a
 * picture of your forehead.
 */

const file = (name: string, type: string, size: number) => {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
};

const photo = () => file("me.jpg", "image/jpeg", 400 * 1024);

const props = {
  initials: "AU",
  name: "Aline Uwase",
  onSave: vi.fn(),
  onRemove: vi.fn(),
  onRefuse: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom has no object URLs of its own.
  URL.createObjectURL = vi.fn(() => "blob:chosen");
  URL.revokeObjectURL = vi.fn();
});

const choose = async (f: File) => {
  await act(async () => {
    fireEvent.change(screen.getByLabelText(/Choose a photo/i), {
      target: { files: [f] },
    });
  });
};

const button = (name: RegExp) =>
  screen.queryAllByRole("button").find((b) => name.test(b.textContent ?? ""));

describe("with no photograph yet", () => {
  beforeEach(() => render(<PhotoPicker {...props} photoUrl={null} />));

  it("shows the initials that stand in for one", () => {
    expect(screen.getByText("AU")).toBeInTheDocument();
  });

  it("says what happens until there is one", () => {
    expect(document.body.textContent).toMatch(/initials are shown until/i);
  });

  it("offers to add one, not to change one", () => {
    expect(button(/Add a photo/)).toBeTruthy();
    expect(button(/Change photo/)).toBeFalsy();
  });

  // Nothing to take down.
  it("offers no way to remove what is not there", () => {
    expect(button(/Remove/)).toBeFalsy();
  });

  it("names whose photograph the frame is for", () => {
    expect(
      screen.getByLabelText(/Add a photo for Aline Uwase/i),
    ).toBeInTheDocument();
  });
});

describe("with a photograph on file", () => {
  beforeEach(() =>
    render(<PhotoPicker {...props} photoUrl="/uploads/photos/a.png" />),
  );

  it("draws it", () => {
    expect(screen.getByAltText("Aline Uwase")).toBeInTheDocument();
  });

  it("offers to change it or take it down", () => {
    expect(button(/Change photo/)).toBeTruthy();
    expect(button(/Remove/)).toBeTruthy();
  });

  it("takes it down when asked", async () => {
    await act(async () => {
      fireEvent.click(button(/Remove/) as HTMLElement);
    });
    expect(props.onRemove).toHaveBeenCalled();
  });

  it("says where it is shown", () => {
    expect(document.body.textContent).toMatch(/beside your name/i);
  });
});

/**
 * The whole reason there is a preview step. A round frame crops to the
 * centre, and somebody should see that before the school stores it, not
 * after.
 */
describe("choosing one", () => {
  beforeEach(() => render(<PhotoPicker {...props} photoUrl={null} />));

  it("shows the chosen file in the frame it will appear in", async () => {
    await choose(photo());
    expect(screen.getByAltText(/photograph you chose/i)).toHaveAttribute(
      "src",
      "blob:chosen",
    );
  });

  it("says the picture is cropped from the centre", async () => {
    await choose(photo());
    expect(document.body.textContent).toMatch(/cropped to a circle/i);
  });

  /* Somebody who picked the wrong one of four near-identical photographs can
     tell from the name and the size without opening anything. */
  it("names the file and its size", async () => {
    await choose(photo());
    expect(document.body.textContent).toContain("me.jpg");
    expect(document.body.textContent).toContain("400KB");
  });

  it("sends nothing until it is saved", async () => {
    await choose(photo());
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it("sends the file that was chosen", async () => {
    const f = photo();
    await choose(f);
    await act(async () => {
      fireEvent.click(button(/Save photo/) as HTMLElement);
    });
    expect(props.onSave).toHaveBeenCalledWith(f);
  });

  it("goes back to what was there when cancelled", async () => {
    await choose(photo());
    await act(async () => {
      fireEvent.click(button(/^Cancel$/) as HTMLElement);
    });
    expect(screen.queryByAltText(/photograph you chose/i)).not.toBeInTheDocument();
    expect(screen.getByText("AU")).toBeInTheDocument();
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it("lets a second choice replace the first", async () => {
    await choose(photo());
    await choose(file("other.png", "image/png", 90 * 1024));
    expect(document.body.textContent).toContain("other.png");
    expect(document.body.textContent).not.toContain("me.jpg");
  });

  /*
    An object URL is a handle on memory the page keeps until it is revoked.
    Choosing four photographs before settling on one should not leave three
    behind.
  */
  it("lets go of the preview it replaces", async () => {
    await choose(photo());
    await choose(file("other.png", "image/png", 90 * 1024));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:chosen");
  });

  it("lets go of it when cancelled", async () => {
    await choose(photo());
    await act(async () => {
      fireEvent.click(button(/^Cancel$/) as HTMLElement);
    });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:chosen");
  });

  it("does nothing when the file dialog is dismissed", async () => {
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/Choose a photo/i), {
        target: { files: [] },
      });
    });
    expect(props.onSave).not.toHaveBeenCalled();
    expect(props.onRefuse).not.toHaveBeenCalled();
  });
});

/**
 * What happens after Save is pressed.
 *
 * Rendered per test rather than from a shared beforeEach: each of these needs
 * its own `onSave`, and rendering twice into one document leaves two pickers
 * on screen with the queries finding the first.
 */
describe("saving one", () => {
  /**
   * Once the photograph is stored, the picker is done: leaving it showing
   * "Save photo" over a picture already saved invites the same upload twice.
   */
  it("settles back once the save succeeds", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<PhotoPicker {...props} onSave={onSave} photoUrl={null} />);
    await choose(photo());
    await act(async () => {
      fireEvent.click(button(/Save photo/) as HTMLElement);
    });
    expect(button(/Save photo/)).toBeFalsy();
    expect(button(/Add a photo/)).toBeTruthy();
  });

  /**
   * And holds the choice when it fails. Pressing Save again must not mean
   * finding the file a second time.
   */
  it("keeps the chosen file when the save is refused", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("refused"));
    render(<PhotoPicker {...props} onSave={onSave} photoUrl={null} />);
    await choose(photo());
    await act(async () => {
      fireEvent.click(button(/Save photo/) as HTMLElement);
    });
    expect(button(/Save photo/)).toBeTruthy();
    expect(document.body.textContent).toContain("me.jpg");
  });

  // A caller with nothing to report is as valid as one that returns a promise.
  it("settles back for a caller that returns nothing", async () => {
    const onSave = vi.fn();
    render(<PhotoPicker {...props} onSave={onSave} photoUrl={null} />);
    await choose(photo());
    await act(async () => {
      fireEvent.click(button(/Save photo/) as HTMLElement);
    });
    expect(button(/Save photo/)).toBeFalsy();
  });

});


/**
 * Refusing a file here rather than after uploading it.
 *
 * The API refuses the wrong type and anything over its limit, correctly. But
 * a person who picked a 12MB photograph should be told at once rather than
 * after it has crossed a school's connection.
 */
describe("a file that cannot be used", () => {
  beforeEach(() => render(<PhotoPicker {...props} photoUrl={null} />));

  it("refuses something that is not a photograph", async () => {
    await choose(file("notes.pdf", "application/pdf", 1000));
    expect(props.onRefuse).toHaveBeenCalledWith(
      expect.stringMatching(/not a photograph/i),
    );
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it("refuses one too large to store", async () => {
    await choose(file("huge.jpg", "image/jpeg", 12 * 1024 * 1024));
    expect(props.onRefuse).toHaveBeenCalledWith(
      expect.stringMatching(/12\.0MB/),
    );
  });

  it("leaves the frame as it was", async () => {
    await choose(file("notes.pdf", "application/pdf", 1000));
    expect(screen.queryByAltText(/photograph you chose/i)).not.toBeInTheDocument();
    expect(screen.getByText("AU")).toBeInTheDocument();
  });
});

/**
 * What the message says. "Invalid file" tells somebody that something is
 * wrong and nothing about which of their choices to change.
 */
describe("why a file was refused", () => {
  it("accepts every type the API stores", () => {
    for (const type of [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
    ]) {
      expect(refusePhoto({ type, size: 1000 })).toBeNull();
    }
  });

  // Browsers append one to a type often enough that it must not matter.
  it("reads a type that carries a charset", () => {
    expect(refusePhoto({ type: "image/png; charset=binary", size: 10 })).toBeNull();
  });

  it("names the formats to choose from", () => {
    expect(refusePhoto({ type: "application/pdf", size: 10 })).toMatch(
      /JPG, PNG, GIF or WEBP/,
    );
  });

  it("names both the size chosen and the size allowed", () => {
    const why = refusePhoto({ type: "image/png", size: 8 * 1024 * 1024 });
    expect(why).toContain("8.0MB");
    expect(why).toContain("5.0MB");
  });

  it("accepts one exactly at the limit", () => {
    expect(refusePhoto({ type: "image/png", size: MAX_PHOTO_BYTES })).toBeNull();
  });

  it("refuses one a byte over it", () => {
    expect(
      refusePhoto({ type: "image/png", size: MAX_PHOTO_BYTES + 1 }),
    ).toBeTruthy();
  });
});

describe("saying how big a file is", () => {
  it("writes megabytes for something large", () => {
    expect(sizeLabel(3 * 1024 * 1024)).toBe("3.0MB");
  });

  it("writes kilobytes for something small", () => {
    expect(sizeLabel(240 * 1024)).toBe("240KB");
  });

  // "0KB" reads as an empty file rather than a small one.
  it("never rounds a real file down to nothing", () => {
    expect(sizeLabel(200)).toBe("1KB");
  });
});
