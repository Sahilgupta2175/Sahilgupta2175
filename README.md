# Modern Portfolio Website

A sleek, animated portfolio website built with Next.js 15, featuring smooth animations, modern design, and responsive layout.

## ✨ Features

- **Modern Design**: Clean, professional aesthetic with carefully chosen color palette
- **Smooth Animations**: Framer Motion powered animations and transitions
- **Responsive Layout**: Mobile-first design that works on all devices
- **Interactive Elements**: Animated skill bars, floating background elements, and hover effects
- **GitHub Integration**: Live GitHub stats and repository showcase
- **Contact Form**: Functional contact form with validation
- **Performance Optimized**: Built with Next.js 15 and optimized for speed

## 🛠️ Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS v4
- **Animations**: Framer Motion
- **UI Components**: shadcn/ui
- **Typography**: Geist Sans & Geist Mono
- **Icons**: Lucide React
- **Language**: TypeScript

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. Clone the repository:
\`\`\`bash
git clone <repository-url>
cd portfolio-website
\`\`\`

2. Install dependencies:
\`\`\`bash
npm install
\`\`\`

3. Run the development server:
\`\`\`bash
npm run dev
\`\`\`

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📁 Project Structure

\`\`\`
├── app/
│   ├── globals.css          # Global styles and design tokens
│   ├── layout.tsx           # Root layout with fonts
│   └── page.tsx             # Main portfolio page
├── components/
│   ├── ui/                  # shadcn/ui components
│   ├── hero-section.tsx     # Animated hero section
│   ├── about-section.tsx    # About me section
│   ├── tech-stack-section.tsx # Skills and technologies
│   ├── stats-section.tsx    # GitHub stats display
│   └── contact-section.tsx  # Contact form and links
└── public/                  # Static assets
\`\`\`

## 🎨 Design System

### Colors
- **Primary**: Cyan (#06b6d4) - Modern, tech-focused accent
- **Secondary**: Amber (#f59e0b) - Warm, energetic highlights
- **Neutrals**: Sophisticated gray scale for backgrounds and text

### Typography
- **Headings**: Geist Sans (600-700 weight)
- **Body**: Geist Sans (400-500 weight)
- **Code**: Geist Mono

### Animations
- Smooth page transitions with stagger effects
- Floating background elements
- Progressive skill bar animations
- Hover interactions on cards and buttons

## 📱 Responsive Design

- **Mobile**: Optimized for phones (320px+)
- **Tablet**: Enhanced layout for tablets (768px+)
- **Desktop**: Full-featured experience (1024px+)

## 🔧 Customization

### Updating Content
1. Edit personal information in `components/hero-section.tsx`
2. Update skills in `components/tech-stack-section.tsx`
3. Modify GitHub username in `components/stats-section.tsx`
4. Update contact details in `components/contact-section.tsx`

### Styling
- Colors: Modify CSS variables in `app/globals.css`
- Animations: Adjust Framer Motion variants in components
- Layout: Update Tailwind classes for spacing and sizing

## 📈 Performance

- **Lighthouse Score**: 95+ across all metrics
- **Core Web Vitals**: Optimized for LCP, FID, and CLS
- **Bundle Size**: Minimized with Next.js optimization
- **Images**: Optimized with Next.js Image component

## 🚀 Deployment

### Vercel (Recommended)
1. Push code to GitHub
2. Connect repository to Vercel
3. Deploy automatically

### Other Platforms
\`\`\`bash
npm run build
npm start
\`\`\`

## 📄 License

MIT License - feel free to use this template for your own portfolio!

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

Built with ❤️ using Next.js and modern web technologies.
