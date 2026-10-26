import "../../test/setup";
const { cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
import { afterEach, describe, expect, it, mock } from "bun:test";
import { GravatarInput } from "../gravatar-input";
import { gravatarUrl } from "../../utils/gravatar";

mock.module("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(cleanup);
const EXPECTED_URL = "https://www.gravatar.com/avatar/973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b?s=160&d=identicon&r=g";

describe("Gravatar avatar setup", () => {
  it("uses the SHA-256 hash of a trimmed lowercase email", async () => {
    expect(await gravatarUrl(" Test@Example.com ")).toBe(EXPECTED_URL);
  });

  it("does not generate a URL for an invalid email", async () => {
    await expect(gravatarUrl("not-an-email")).rejects.toThrow("Invalid email");
  });

  it("writes the avatar URL to the draft without persisting the email", async () => {
    const onChange = mock();
    const { getByLabelText, getByRole } = render(<GravatarInput onChange={onChange} />);
    fireEvent.change(getByLabelText("settings.site.avatar.gravatar.title"), { target: { value: "test@example.com" } });
    fireEvent.click(getByRole("button", { name: "settings.site.avatar.gravatar.button" }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(EXPECTED_URL));
    expect(onChange.mock.calls[0][0]).not.toContain("test@example.com");
  });
});
