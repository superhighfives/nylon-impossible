import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LinkifiedText } from "../LinkifiedText";

describe("LinkifiedText", () => {
  it("renders plain text without links", () => {
    render(<LinkifiedText text="Buy groceries" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Buy groceries")).toBeInTheDocument();
  });

  it("links a bare URL, opening in a new tab safely", () => {
    const url = "https://x.com/shpigford/status/2074476150059835754?s=46";
    render(<LinkifiedText text={url} />);
    const link = screen.getByRole("link", { name: url });
    expect(link).toHaveAttribute("href", url);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("links a URL embedded in surrounding text", () => {
    render(<LinkifiedText text="see https://example.com/post now" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "https://example.com/post");
    expect(link).toHaveTextContent("https://example.com/post");
  });

  it("trims trailing sentence punctuation out of the link", () => {
    render(<LinkifiedText text="read https://example.com/a." />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "https://example.com/a");
  });

  it("links multiple URLs in one string", () => {
    render(
      <LinkifiedText text="https://a.example.com and https://b.example.com" />,
    );
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });
});
