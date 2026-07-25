---
name: Kinetic Horizon
colors:
  surface: '#f9f9ff'
  surface-dim: '#d3daee'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f1f3ff'
  surface-container: '#e9edff'
  surface-container-high: '#e2e8fc'
  surface-container-highest: '#dce2f6'
  on-surface: '#151b2a'
  on-surface-variant: '#424655'
  inverse-surface: '#2a3040'
  inverse-on-surface: '#edf0ff'
  outline: '#737687'
  outline-variant: '#c2c6d8'
  surface-tint: '#0054d7'
  primary: '#0053d5'
  on-primary: '#ffffff'
  primary-container: '#1f6bff'
  on-primary-container: '#fffeff'
  inverse-primary: '#b3c5ff'
  secondary: '#745b00'
  on-secondary: '#ffffff'
  secondary-container: '#fdcc1c'
  on-secondary-container: '#6e5700'
  tertiary: '#a43a00'
  on-tertiary: '#ffffff'
  tertiary-container: '#cd4b00'
  on-tertiary-container: '#fffeff'
  error: '#E94534'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b3c5ff'
  on-primary-fixed: '#00184a'
  on-primary-fixed-variant: '#003fa5'
  secondary-fixed: '#ffe08a'
  secondary-fixed-dim: '#f0c103'
  on-secondary-fixed: '#241a00'
  on-secondary-fixed-variant: '#574400'
  tertiary-fixed: '#ffdbce'
  tertiary-fixed-dim: '#ffb599'
  on-tertiary-fixed: '#370e00'
  on-tertiary-fixed-variant: '#7f2b00'
  background: '#f9f9ff'
  on-background: '#151b2a'
  surface-variant: '#dce2f6'
  paper: '#F7F9FC'
  line: '#E2E8F1'
  success: '#C6F135'
typography:
  display-xl:
    fontFamily: Hanken Grotesk
    fontSize: 80px
    fontWeight: '700'
    lineHeight: 88px
    letterSpacing: -0.02em
  display-lg:
    fontFamily: Hanken Grotesk
    fontSize: 64px
    fontWeight: '700'
    lineHeight: 72px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 48px
    fontWeight: '600'
    lineHeight: 56px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-bold:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.02em
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  '4': 4px
  '8': 8px
  '12': 12px
  '16': 16px
  '24': 24px
  '32': 32px
  '48': 48px
  '64': 64px
  '96': 96px
  '128': 128px
  '160': 160px
---

## Brand & Style

The design system is engineered for the high-velocity world of international travel, prioritizing clarity, speed, and premium reliability. It adopts an **Apple-grade Minimalist** aesthetic, characterized by "ruthless whitespace" that allows key actions to breathe and reduces cognitive load for travelers in transit. 

The visual language balances a high-tech utilitarian feel with a welcoming, optimistic tone. It utilizes a structured hierarchy where color is used surgically—only to direct attention or signal status—while the layout maintains a disciplined adherence to optical alignment. The result is a UI that feels less like a website and more like a high-performance utility tool.

## Colors

This design system utilizes a high-contrast palette where white and "Paper" (#F7F9FC) dominate the canvas. 

- **Primary Blue (#1F6BFF):** Reserved for primary actions, active states, and critical brand touchpoints.
- **Accent Yellow (#FFCE1F):** Used exclusively for highlights, promotional badges, or "New" tags to draw the eye without overwhelming the professional tone.
- **Neutrals:** "Ink" (#0B1220) provides deep, legible contrast for typography. "Line" (#E2E8F1) is used for subtle borders and structural dividers.
- **Semantic Colors:** Derived from the brand profile, using a vibrant red for errors and a lime-green for success states, maintaining high saturation to cut through the clean layout.

## Typography

Typography is the primary driver of the design system's hierarchy. We use **Hanken Grotesk** (as a high-quality alternative to General Sans) for all display and heading roles to provide a modern, geometric precision. **Inter** is used for all body text and UI labels due to its exceptional legibility and neutral, functional character.

- **Display Styles:** Use tight letter spacing and substantial weights to create an "editorial" feel.
- **Headlines:** Should be "ruthlessly" aligned to the grid, prioritizing clear information architecture.
- **Body:** Maintains a generous line height for maximum readability on small screens during travel.

## Layout & Spacing

This design system employs a **Fixed Grid** model on desktop (12 columns, 1200px max-width) and a **Fluid Grid** on mobile (4 columns). 

- **The 8px Rhythm:** All spacing must be a multiple of 4px or 8px. 
- **Whitespace:** Do not be afraid of large gaps (64px+) between sections to signify a change in context. 
- **Alignment:** Use optical alignment for icons and text. Headlines should always sit closer to their related body text than the element above them.
- **Breakpoints:**
  - Mobile: < 768px (16px margins)
  - Tablet: 768px - 1024px (32px margins)
  - Desktop: > 1024px (Gutter 24px, auto margins)

## Elevation & Depth

We avoid heavy shadows and skeuomorphism in favor of **Tonal Layering** and **Low-Alpha Shadows**.

- **Level 0 (Base):** Paper (#F7F9FC) background.
- **Level 1 (Cards/Surface):** White (#FFFFFF) with a 1px border of "Line" (#E2E8F1). No shadow.
- **Level 2 (Hover/Active):** White (#FFFFFF) with a soft shadow: `0px 4px 12px rgba(11, 18, 32, 0.04)`.
- **Level 3 (Modals/Overlays):** White (#FFFFFF) with a pronounced but soft shadow: `0px 12px 32px rgba(11, 18, 32, 0.08)`.

Transitions between levels should use a **200ms ease-out** motion to feel responsive and fluid.

## Shapes

The design system uses a generous corner radius to soften the technical nature of eSIM technology. 

- **Small (10px):** For inputs, small buttons, and tags.
- **Medium (16px):** Standard for cards and feature blocks.
- **Large (24px):** Used for primary hero containers or large imagery.
- **Pill:** Reserved for secondary buttons, search bars, and status badges to distinguish them from primary structural elements.

## Components

- **Buttons:** 
  - *Primary:* Blue background, white text, 10px radius. Heavy weight label.
  - *Secondary:* White background, blue text, 1px Line border, Pill shape.
- **Input Fields:** 10px radius, Paper (#F7F9FC) background with a 1px Line border. On focus, the border turns Primary Blue with a 2px outer glow.
- **Cards:** White background, 16px radius, subtle Line border. Use 24px padding internally. 
- **Chips/Badges:** Pill-shaped. Use Accent Yellow for highlights or "New" features. Use Line background for neutral categories.
- **eSIM Cards:** Specific card type for plan selection. Use bold Primary Blue for the price and the country name in Display fonts.
- **Motion:** All interactive states (hover, active, focus) must utilize a 150-250ms ease-out transition. Avoid "snapping" between states.