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

  // Tech stack section. `icon` is a Simple Icons slug (simpleicons.org, fetched
  // at build time) or 'db' / 'code' for the built-in drawn icons; `color` is the
  // brand colour (auto-adjusted per theme so it stays readable).
  stack: {
    Languages: [
      { name: 'JavaScript', icon: 'javascript', color: '#F7DF1E' },
      { name: 'Java', icon: 'openjdk', color: '#ED8B00' },
      { name: 'SQL', icon: 'db', color: '#4479A1' },
      { name: 'PL/SQL', icon: 'oracle', color: '#F80000' }
    ],
    Frontend: [
      { name: 'React', icon: 'react', color: '#61DAFB' },
      { name: 'Next.js', icon: 'nextdotjs', color: '#000000' },
      { name: 'Redux', icon: 'redux', color: '#764ABC' },
      { name: 'Tailwind CSS', icon: 'tailwindcss', color: '#06B6D4' },
      { name: 'HTML', icon: 'html5', color: '#E34F26' },
      { name: 'CSS', icon: 'css3', color: '#1572B6' },
      { name: 'Bootstrap', icon: 'bootstrap', color: '#7952B3' }
    ],
    Backend: [
      { name: 'Node.js', icon: 'nodedotjs', color: '#5FA04E' },
      { name: 'Express', icon: 'express', color: '#000000' },
      { name: 'Socket.IO', icon: 'socketdotio', color: '#010101' }
    ],
    Databases: [
      { name: 'MongoDB', icon: 'mongodb', color: '#47A248' },
      { name: 'MySQL', icon: 'mysql', color: '#4479A1' },
      { name: 'PostgreSQL', icon: 'postgresql', color: '#4169E1' }
    ],
    Tools: [
      { name: 'Git', icon: 'git', color: '#F05032' },
      { name: 'GitHub', icon: 'github', color: '#181717' },
      { name: 'Postman', icon: 'postman', color: '#FF6C37' },
      { name: 'Vercel', icon: 'vercel', color: '#000000' },
      { name: 'VS Code', icon: 'code', color: '#007ACC' },
      { name: 'Cloudinary', icon: 'cloudinary', color: '#3448C5' }
    ]
  },

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
