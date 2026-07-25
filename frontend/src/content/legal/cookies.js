export const COOKIES = {
  slug: "cookies",
  title: "Cookie Policy",
  subtitle:
    "How eSIMFlys uses cookies and similar technologies — kept deliberately minimal.",
  sections: [
    {
      id: "what-are-cookies",
      title: "What cookies are",
      body: [
        { p: "Cookies are small text files that a website stores on your device. They let a site remember your preferences and understand how it is being used. We use them sparingly, and only where they help the Service work or improve." },
      ],
    },
    {
      id: "cookies-we-use",
      title: "Cookies we use",
      body: [
        { p: "We group our cookies into two categories:" },
        {
          ul: [
            "Essential — a single preference cookie remembers your chosen display currency so prices show correctly. It is required for the site to work as expected and is always on.",
            "Analytics — optional. We only set analytics cookies if you accept them in our cookie banner. Analytics stay off unless you opt in, and we do not use them for advertising.",
          ],
        },
      ],
    },
    {
      id: "managing-cookies",
      title: "Managing your choices",
      body: [
        { p: "You can accept or decline optional cookies at any time using the cookie banner shown when you visit the site. You can also clear or block cookies through your browser settings — though blocking the essential preference cookie may affect how prices are displayed." },
        {
          p: [
            "For more on how we handle your personal data, see our ",
            { href: "/legal/privacy", label: "Privacy Policy" },
            ".",
          ],
        },
      ],
    },
    {
      id: "contact",
      title: "Contact",
      body: [
        { p: "If you have any questions about our use of cookies, you can reach our team:" },
        {
          p: [
            "Customer support: ",
            { href: "mailto:support@esimflys.com", label: "support@esimflys.com" },
          ],
        },
      ],
    },
  ],
};
