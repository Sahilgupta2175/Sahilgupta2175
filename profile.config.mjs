// Everything the profile shows that isn't fetched live. Edit here, then run
// `node scripts/build.mjs` (or let the daily GitHub Action do it).
//
// Live data, refreshed on every build:
//   - role, problem count                       <- portfolio admin API
//   - latest posts                              <- portfolio blog API (synced from Hashnode)
//   - avatar, repos, stars/forks, languages,
//     contribution calendar                     <- GitHub API (calendar needs GITHUB_TOKEN)
// If a source is down, the build reuses the last good values from assets/data.json.

export default {
  user: 'Sahilgupta2175',
  name: 'Sahil Gupta',
  role: 'Full-stack developer',
  location: 'Bangalore, IN',
  tagline: 'I design and build web products end to end: auth, payments, real-time features and the last pixel.',
  education: 'B.Tech CSE (Hons) · GLA University',

  api: 'https://sahil-gupta-portfolio-backend.vercel.app',
  site: 'https://sahilgupta.tech',

  links: [
    ['sahilgupta.tech', 'https://sahilgupta.tech'],
    ['LinkedIn', 'https://www.linkedin.com/in/sahil-gupta-35199620a/'],
    ['Hashnode', 'https://sahilxdev.hashnode.dev'],
    ['Peerlist', 'https://peerlist.io/sahilgupta2175'],
    ['Email', 'mailto:guptasahil2175@gmail.com']
  ],

  stack: [
    'JavaScript', 'React', 'Next.js', 'Redux', 'Tailwind CSS', 'Node.js', 'Express',
    'MongoDB', 'MySQL', 'PostgreSQL', 'SQL', 'PL/SQL', 'Java', 'Git', 'Postman'
  ],

  // Curated, in display order. `status: 'Building'` marks work in progress.
  projects: [
    {
      title: 'DriveEase',
      what: 'Peer-to-peer vehicle rental marketplace for Indian cities',
      stack: ['Next.js', 'Razorpay', 'PostHog', 'Vercel'],
      status: 'Building'
    },
    {
      title: 'README Craft',
      what: 'GitHub profile README generator with GitHub OAuth login',
      stack: ['Full-stack JS', 'GitHub OAuth'],
      url: 'https://readme-craft-sg.vercel.app',
      repo: 'https://github.com/Sahilgupta2175/github-readme-profile-generator'
    },
    {
      title: 'ChaiTailwind-CSS',
      what: 'Utility-CSS compiler: reads HTML, extracts classes, emits CSS',
      stack: ['Node.js', 'zero dependencies'],
      repo: 'https://github.com/Sahilgupta2175/ChaiTailwind-CSS'
    },
    {
      title: 'Vehicle Rental Services',
      what: 'Multi-role rental platform with payments and an AI assistant',
      stack: ['React', 'Node.js', 'MongoDB', 'Socket.IO', 'Razorpay'],
      url: 'https://vrs-sg.vercel.app',
      repo: 'https://github.com/Sahilgupta2175/vehicle-rental-services'
    },
    {
      title: 'Wanderlust',
      what: 'Airbnb-inspired property rentals with maps, auth and bookings',
      stack: ['Node.js', 'Express', 'MongoDB', 'Mapbox'],
      url: 'https://wanderlust-sg.vercel.app',
      repo: 'https://github.com/Sahilgupta2175/Wanderlust'
    },
    {
      title: 'InShare',
      what: 'File sharing by email or direct link, links self-destruct',
      stack: ['Node.js', 'Express', 'MongoDB'],
      url: 'https://inshare-sg.vercel.app',
      repo: 'https://github.com/Sahilgupta2175/inshare-project'
    },
    {
      title: 'URL Shortener',
      what: 'Turns long URLs into short, shareable links',
      stack: ['React', 'Vite', 'Node.js', 'MongoDB'],
      repo: 'https://github.com/Sahilgupta2175/URL-Shortner'
    },
    {
      title: 'Portfolio',
      what: 'This site: React front end, Node API, admin panel, email list',
      stack: ['React', 'Node.js', 'Express', 'MongoDB'],
      url: 'https://sahilgupta.tech',
      repo: 'https://github.com/Sahilgupta2175/Sahil-Gupta-Portfolio'
    }
  ],

  postsToShow: 3,

  // Left out of the language bar (it counts each repo's main language).
  hideLanguages: ['Jupyter Notebook']
};
