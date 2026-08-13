import { type Metadata } from "next";

export const metadata: Metadata = {
  title: "Paystream",
  description: "Paystream",
  keywords: [],
  //   robots: "index,follow",
  openGraph: {
    title: "Paystream",
    description: "Paystream",
    images: [
      {
        url: "",
        secureUrl: "",
        width: 1200,
        height: 630,
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Paystream",
    description: "Paystream",
    site: "@paystreamlabs",
    creator: "@paystreamlabs",
    images: [
      {
        url: "",
        alt: "Cover Image of paystream",
      },
    ],
  },
};

export default function LeaderboardLayout(props: any) {
  return <section>{props.children}</section>;
}
