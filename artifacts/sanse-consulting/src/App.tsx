import { type FormEvent, type ReactNode, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Building2,
  Check,
  ChevronDown,
  Compass,
  FileCheck2,
  Layers3,
  Leaf,
  Menu,
  Wind,
  X,
} from 'lucide-react';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeFaq, setActiveFaq] = useState<number | null>(0);
  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const [inquiry, setInquiry] = useState({
    name: '',
    email: '',
    project: 'New building',
    stage: '',
  });
  const [submitted, setSubmitted] = useState(false);

  const navItems = [
    ['Approach', '#approach'],
    ['Services', '#services'],
    ['Team', '#Team'],
    ['LEED, made clearer', '#leed'],
  ];

  const faqs = [
    {
      question: 'When should we bring Sanse Green into a project?',
      answer:
        'Earlier is usually more useful. In concept and pre-design, the team has the most room to compare pathways and coordinate sustainability goals with the project brief. We can also help projects already underway make sense of next steps.',
    },
    {
      question: 'Do you work with the whole project team?',
      answer:
        'Yes. Our role is to make the sustainability work legible across owners, architects, engineers, contractors and other project partners—so responsibilities and documentation are easier to coordinate.',
    },
    {
      question: 'Can you guarantee LEED certification?',
      answer:
        'No. Certification decisions are made by the relevant certification body and depend on a project’s design, delivery and review. Sanse Green provides consulting support to help teams understand requirements and prepare their work.',
    },
    {
      question: 'What if we are not sure which LEED pathway fits?',
      answer:
        'That is a good place to start. We can help you frame project goals, compare relevant options and identify a pathway that feels achievable for your team and project context.',
    },
  ];

  const makeDraft = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = [
      `Hello Sanse Green,`,
      ``,
      `I’m ${inquiry.name || '[your name]'} and I’d like to talk about LEED certification consulting for a ${inquiry.project.toLowerCase()} project.`,
      inquiry.stage ? `Project stage: ${inquiry.stage}` : '',
      draft ? `A little about the project: ${draft}` : '',
      `You can reach me at ${inquiry.email || '[your email]'}.`,
      ``,
      `Thank you.`,
    ]
      .filter(Boolean)
      .join('\n');
    setDraft(message);
    setSubmitted(true);
    setCopied(false);
  };

  const copyDraft = async () => {
    await navigator.clipboard.writeText(draft);
    setCopied(true);
  };

  return (
    <div className="min-h-[100dvh] overflow-hidden bg-[#f3f3e8] text-[#203c32]">
      <header className="sticky top-0 z-50 border-b border-[#203c32]/10 bg-[#f3f3e8]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[76px] max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-14">
          <a href="#top" className="flex items-center gap-2.5" aria-label="Sanse Green home">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#214a3b] text-[#e8eed3]">
              <Leaf size={18} strokeWidth={1.8} />
            </span>
            <span className="flex flex-col gap-1">
              <span className="font-display text-[27px] leading-none tracking-[-.05em]">sanse green</span>
              <span className="whitespace-nowrap text-[8px] leading-none tracking-[.01em] text-[#638269]">
                Breathing life into sustainable buildings.
              </span>
            </span>
          </a>
          <nav className="hidden items-center gap-8 lg:flex" aria-label="Main navigation">
            {navItems.map(([label, href]) => (
              <a key={label} href={href} className="text-[13px] font-medium text-[#53665b] transition-colors hover:text-[#214a3b]">{label}</a>
            ))}
          </nav>
          <a href="#contact" className="hidden items-center gap-2 rounded-full bg-[#214a3b] px-5 py-3 text-[13px] font-semibold text-[#f3f3e8] transition-transform hover:-translate-y-0.5 sm:flex">
            Start a conversation <ArrowUpRight size={15} />
          </a>
          <button className="flex h-11 w-11 items-center justify-center rounded-full border border-[#203c32]/15 lg:hidden" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} data-testid="button-menu">
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
        {menuOpen && (
          <nav className="border-t border-[#203c32]/10 bg-[#f3f3e8] px-5 py-4 lg:hidden" aria-label="Mobile navigation">
            {navItems.map(([label, href]) => (
              <a key={label} href={href} onClick={() => setMenuOpen(false)} className="block border-b border-[#203c32]/10 py-3 text-sm">{label}</a>
            ))}
            <a href="#contact" onClick={() => setMenuOpen(false)} className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#214a3b] px-5 py-3 text-sm text-[#f3f3e8]">Start a conversation <ArrowUpRight size={15} /></a>
          </nav>
        )}
      </header>

      <main id="top">
        <section className="bg-[#2b5947] px-5 py-6 text-[#f3f3e8] sm:px-8 sm:py-8 lg:px-14 lg:py-10">
          <div className="mx-auto flex max-w-[1280px] flex-col items-start justify-between gap-5 sm:flex-row sm:items-end sm:gap-8">
            <div>
              <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-[#dce4c9] text-[#315b47]"><Wind size={18} /></span>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[.22em] text-[#c2d0a0]">The Sanse Green point of view</p>
              <h2 className="max-w-[780px] font-display text-[clamp(1.75rem,4vw,3.4rem)] leading-[.95] tracking-[-.05em]">Breathing life into<br /><em className="font-normal text-[#c4d39d]">sustainable buildings.</em></h2>
            </div>
            <p className="max-w-[300px] pb-2 text-[14px] leading-[1.8] text-[#d2ddc9]">Places shape how we live, work and feel. We help teams make choices that keep that human experience in view.</p>
          </div>
        </section>

        <section className="mx-auto max-w-[1440px] px-5 pb-16 pt-10 sm:px-8 sm:pt-16 lg:px-14 lg:pb-24 lg:pt-20">
          <div className="grid items-center gap-10 lg:grid-cols-[.89fr_1.11fr] lg:gap-12">
            <div className="reveal relative z-10">
              <div className="mb-8 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[.22em] text-[#638269]">
                <span className="h-px w-8 bg-[#8b9d72]" /> Sustainability, made workable
              </div>
              <h1 className="max-w-[690px] font-display text-[clamp(1.85rem,4vw,3.625rem)] leading-[.91] tracking-[-.055em] text-[#234b3b]">
                Better buildings<br />begin with a <em className="font-normal text-[#8e9d66]">clear</em><br />way forward.
              </h1>
              <p className="mt-8 max-w-[435px] text-[16px] leading-[1.75] text-[#607166] sm:text-[17px]">
                Sanse Green helps project teams turn sustainability ambitions into thoughtful, achievable action—from the first conversation to the final submission.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-5">
                <a href="#services" className="group inline-flex items-center gap-3 rounded-full bg-[#214a3b] px-6 py-4 text-sm font-semibold text-[#f3f3e8] transition-all hover:bg-[#183c2e]">
                  Explore our approach <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                </a>
                <a href="#approach" className="inline-flex items-center gap-2 text-sm font-semibold text-[#486958]">How we work <ArrowDownRight size={16} /></a>
              </div>
            </div>
            <div className="reveal-delay relative">
              <div className="absolute -right-3 -top-6 z-10 hidden h-[112px] w-[112px] items-center justify-center rounded-full border border-[#f3f3e8]/70 bg-[#d5dfba] text-center text-[9px] font-bold uppercase leading-[1.55] tracking-[.18em] text-[#365944] shadow-sm sm:flex">
                Every<br />structure<br />deserves<br />clean<br />breath.
              </div>
              <div className="relative aspect-[1.13/1] overflow-hidden rounded-[48%_48%_3%_3%] sm:rounded-[48%_48%_2%_2%]">
                <img src="/sanse-building-landscape.jpg" alt="A sunlit low-impact building surrounded by meadow grasses and mature trees" className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#183c2e]/40 via-transparent to-transparent" />
                <div className="absolute bottom-6 left-6 right-6 flex items-end justify-between text-[#fff9e9] sm:bottom-8 sm:left-8 sm:right-8">
                  <p className="max-w-[250px] font-display text-[25px] leading-tight sm:text-[30px]">A lighter footprint.<br />A fuller life.</p>
                  <span className="hidden text-[9px] font-semibold uppercase tracking-[.2em] sm:block">Design living, sustainable efficiency.</span>
                </div>
              </div>
              <span className="absolute -bottom-7 -left-5 -z-0 h-28 w-28 rounded-full border border-[#adbc8c]/50 sm:-left-8" />
            </div>
          </div>
          <div className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-[#203c32]/15 pt-5 text-[10px] font-semibold uppercase tracking-[.18em] text-[#718176]">
            <span>For owners, designers & project teams</span>
            <span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#8e9d66]" /> LEED certification consulting</span>
            <span className="hidden sm:block">A more considered built world</span>
          </div>
        </section>

        <section id="approach" className="bg-[#e8ecdc] px-5 py-20 sm:px-8 sm:py-28 lg:px-14">
          <div className="mx-auto grid max-w-[1280px] gap-12 lg:grid-cols-[.78fr_1.22fr] lg:gap-24">
            <div>
              <p className="mb-5 text-[10px] font-bold uppercase tracking-[.22em] text-[#75895f]">A clearer path through complexity</p>
              <h2 className="font-display text-[clamp(2.8rem,5.6vw,5.3rem)] leading-[.97] tracking-[-.05em] text-[#234b3b]">Sustainability<br />is a team sport.</h2>
              <div className="mt-8 h-px w-20 bg-[#82936a]" />
              <p className="mt-7 max-w-[360px] text-[15px] leading-[1.8] text-[#607166]">Requirements can feel like another language. We translate them into a shared plan your team can understand, shape and carry forward.</p>
              <a href="#contact" className="mt-8 inline-flex items-center gap-2 text-sm font-bold text-[#315b47]">Talk through your project <ArrowUpRight size={16} /></a>
            </div>
            <div className="grid gap-0 sm:grid-cols-2">
              {[
                { number: '01', title: 'Clarity before complexity', body: 'We help make the options visible early, before requirements become a scramble.' },
                { number: '02', title: 'A path that fits', body: 'Goals, schedule, scope and team capacity all have a place in the conversation.' },
                { number: '03', title: 'People in sync', body: 'We help coordinate the moving pieces so sustainability has a voice across disciplines.' },
                { number: '04', title: 'Progress you can see', body: 'A well-organized record makes decisions and documentation easier to follow.' },
              ].map((item, index) => (
                <article key={item.number} className={`border-t border-[#526b57]/25 py-7 sm:px-6 ${index % 2 === 1 ? 'sm:border-l' : ''}`}>
                  <span className="font-mono text-[11px] text-[#81936c]">{item.number} / 04</span>
                  <h3 className="mt-5 font-display text-[26px] leading-tight text-[#2e5945]">{item.title}</h3>
                  <p className="mt-3 max-w-[290px] text-[14px] leading-[1.7] text-[#67796d]">{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="services" className="mx-auto max-w-[1440px] px-5 py-20 sm:px-8 sm:py-28 lg:px-14">
          <div className="mb-12 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <div>
              <p className="mb-5 text-[10px] font-bold uppercase tracking-[.22em] text-[#75895f]">How we can help</p>
              <h2 className="font-display text-[clamp(2.7rem,5vw,5rem)] leading-[.98] tracking-[-.05em] text-[#234b3b]">Good work, made<br /><em className="font-normal text-[#8e9d66]">easier to navigate.</em></h2>
            </div>
            <p className="max-w-[360px] text-[14px] leading-[1.75] text-[#66776b]">From early planning to certification submission, we bring order and momentum to the sustainability work behind a building.</p>
          </div>
          <div className="grid gap-3 lg:grid-cols-[1.05fr_.95fr]">
            <article className="relative min-h-[360px] overflow-hidden rounded-[2rem] bg-[#214a3b] p-7 text-[#f3f3e8] sm:p-10">
              <div className="absolute -right-8 -top-16 h-64 w-64 rounded-full border border-[#e8eed3]/20" />
              <div className="absolute -right-1 -top-9 h-48 w-48 rounded-full border border-[#e8eed3]/20" />
              <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-[#dce4c9] text-[#315b47]"><Compass size={21} /></span>
              <p className="relative mt-14 text-[10px] font-semibold uppercase tracking-[.2em] text-[#c2d0a0]">Start with the big picture</p>
              <h3 className="relative mt-4 max-w-[520px] font-display text-[36px] leading-[1.05] sm:text-[46px]">Early planning &<br />LEED pathway guidance</h3>
              <p className="relative mt-5 max-w-[400px] text-[14px] leading-[1.7] text-[#d2ddc9]">Frame sustainability goals, understand relevant LEED options and identify a practical direction for your project.</p>
              <a href="#contact" className="relative mt-8 inline-flex items-center gap-2 text-sm font-semibold text-[#e1e9cb]">Explore a starting point <ArrowRight size={16} /></a>
            </article>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { icon: <Building2 size={20} />, name: 'Project team coordination', copy: 'Connect the dots between owners, design disciplines and delivery teams.' },
                { icon: <Layers3 size={20} />, name: 'Credit & documentation planning', copy: 'Organize requirements, responsibilities and the evidence they call for.' },
                { icon: <FileCheck2 size={20} />, name: 'Submission preparation', copy: 'Bring project records together and prepare materials for certification review.' },
                { icon: <Leaf size={20} />, name: 'Ongoing sustainability counsel', copy: 'Keep goals in view as design decisions and project realities evolve.' },
              ].map((service) => (
                <article key={service.name} className="flex min-h-[205px] flex-col rounded-[1.6rem] border border-[#203c32]/12 bg-[#f7f6ed] p-6 transition-transform hover:-translate-y-1">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e2e9d5] text-[#567353]">{service.icon}</span>
                  <h3 className="mt-5 font-display text-[22px] leading-tight text-[#315b47]">{service.name}</h3>
                  <p className="mt-2 text-[13px] leading-[1.65] text-[#69786d]">{service.copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="Team" className="relative overflow-hidden bg-[#d8e1c9] px-5 py-20 sm:px-8 sm:py-24 lg:px-14">
          <div className="pointer-events-none absolute -right-28 top-[-15rem] h-[520px] w-[520px] rounded-full border border-[#66815c]/20" />
          <div className="pointer-events-none absolute -right-10 top-[-11rem] h-[390px] w-[390px] rounded-full border border-[#66815c]/20" />
          <div className="relative mx-auto grid max-w-[1280px] items-center gap-12 lg:grid-cols-[1fr_.8fr]">
            <div>
              <p className="mb-5 text-[10px] font-bold uppercase tracking-[.22em] text-[#64805e]">Who we work alongside</p>
              <h2 className="max-w-[650px] font-display text-[clamp(2.8rem,5.8vw,5.5rem)] leading-[.94] tracking-[-.05em] text-[#234b3b]">Different roles.<br /><em className="font-normal text-[#69815c]">One shared place.</em></h2>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-0 border-t border-[#61785a]/30">
              {['Building owners', 'Architects & designers', 'Engineers', 'Project managers', 'Developers', 'Construction teams'].map((audience, i) => (
                <div key={audience} className="flex items-center gap-3 border-b border-[#61785a]/30 py-4 text-[13px] font-medium text-[#365844] sm:text-[14px]">
                  <span className="font-mono text-[10px] text-[#82946c]">0{i + 1}</span>{audience}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="leed" className="bg-[#f8f6ed] px-5 py-20 sm:px-8 sm:py-28 lg:px-14">
          <div className="mx-auto max-w-[1280px]">
            <div className="grid gap-10 lg:grid-cols-[.72fr_1.28fr] lg:gap-24">
              <div>
                <p className="mb-5 text-[10px] font-bold uppercase tracking-[.22em] text-[#75895f]">A useful framework, not a finish line</p>
                <h2 className="font-display text-[clamp(2.7rem,5vw,4.8rem)] leading-[.98] tracking-[-.05em] text-[#234b3b]">What LEED<br />can make possible.</h2>
              </div>
              <div>
                <p className="max-w-[680px] text-[16px] leading-[1.8] text-[#5f7165]">LEED is a widely used framework for thinking about how buildings affect people and the environment. Its requirements can help project teams bring energy, water, materials, indoor experience and site considerations into the same conversation.</p>
                <p className="mt-5 max-w-[680px] text-[14px] leading-[1.8] text-[#708075]">Sanse Green provides <strong className="font-semibold text-[#315b47]">LEED certification consulting</strong> to help teams understand the process, plan their documentation and prepare for review. Certification is determined by the applicable review body; no outcome can be promised.</p>
                <div className="mt-9 grid gap-px overflow-hidden rounded-2xl border border-[#d8ddd0] bg-[#d8ddd0] sm:grid-cols-3">
                  {[
                    ['Understand', 'Explore goals and relevant requirements.'],
                    ['Coordinate', 'Bring people, credits and evidence together.'],
                    ['Prepare', 'Organize documentation for submission.'],
                  ].map(([heading, text], i) => (
                    <div key={heading} className="bg-[#f1f1e6] p-5 sm:p-6">
                      <span className="font-mono text-[10px] text-[#84946e]">0{i + 1}</span>
                      <h3 className="mt-3 font-display text-[24px] text-[#315b47]">{heading}</h3>
                      <p className="mt-1 text-[12px] leading-[1.65] text-[#6b7a6f]">{text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1440px] px-5 py-20 sm:px-8 sm:py-28 lg:px-14">
          <div className="grid gap-12 lg:grid-cols-[.75fr_1.25fr] lg:gap-24">
            <div>
              <p className="mb-5 text-[10px] font-bold uppercase tracking-[.22em] text-[#75895f]">A steady hand, at every stage</p>
              <h2 className="font-display text-[clamp(2.7rem,5vw,4.8rem)] leading-[.98] tracking-[-.05em] text-[#234b3b]">From first<br />question to<br /><em className="font-normal text-[#8e9d66]">ready to submit.</em></h2>
              <p className="mt-7 max-w-[340px] text-[14px] leading-[1.8] text-[#66776b]">Every project is different. The work can flex to meet your team where it is.</p>
            </div>
            <ol className="border-t border-[#203c32]/15">
              {[
                ['Listen & orient', 'Get to know the project, people, goals and questions that are already on the table.'],
                ['Map a direction', 'Discuss relevant LEED options and shape a pathway around the project’s context and capacity.'],
                ['Coordinate the work', 'Clarify credit responsibilities, connect contributors and keep documentation organized.'],
                ['Prepare for review', 'Help assemble and check the project record for certification submission.'],
              ].map(([title, text], i) => (
                <li key={title} className="grid grid-cols-[42px_1fr] gap-4 border-b border-[#203c32]/15 py-6 sm:grid-cols-[64px_1fr] sm:gap-6 sm:py-7">
                  <span className="mt-1 flex h-9 w-9 items-center justify-center rounded-full border border-[#aabb91] font-mono text-[11px] text-[#68805f]">{i + 1}</span>
                  <div>
                    <h3 className="font-display text-[25px] text-[#315b47]">{title}</h3>
                    <p className="mt-2 max-w-[590px] text-[13px] leading-[1.7] text-[#6a7a6e]">{text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-[1440px] px-5 py-20 sm:px-8 sm:py-28 lg:px-14">
          <div className="grid gap-10 lg:grid-cols-[.75fr_1.25fr] lg:gap-24">
            <div>
              <p className="mb-5 text-[10px] font-bold uppercase tracking-[.22em] text-[#75895f]">Good questions to start with</p>
              <h2 className="font-display text-[clamp(2.7rem,5vw,4.6rem)] leading-[.98] tracking-[-.05em] text-[#234b3b]">A little more<br />clarity.</h2>
            </div>
            <div className="border-t border-[#203c32]/15">
              {faqs.map((faq, index) => (
                <div key={faq.question} className="border-b border-[#203c32]/15">
                  <button className="flex w-full items-center justify-between gap-6 py-5 text-left sm:py-6" onClick={() => setActiveFaq(activeFaq === index ? null : index)} aria-expanded={activeFaq === index} data-testid={`button-faq-${index}`}>
                    <span className="font-display text-[22px] leading-tight text-[#315b47] sm:text-[25px]">{faq.question}</span>
                    <ChevronDown size={18} className={`shrink-0 text-[#71845e] transition-transform ${activeFaq === index ? 'rotate-180' : ''}`} />
                  </button>
                  {activeFaq === index && <p className="max-w-[670px] pb-6 pr-10 text-[13px] leading-[1.75] text-[#69796d]">{faq.answer}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="contact" className="relative bg-[#e4e9d7] px-5 py-20 sm:px-8 sm:py-24 lg:px-14">
          <div className="mx-auto grid max-w-[1280px] gap-12 lg:grid-cols-[.82fr_1.18fr] lg:gap-24">
            <div>
              <p className="mb-5 text-[10px] font-bold uppercase tracking-[.22em] text-[#75895f]">Let’s begin somewhere</p>
              <h2 className="font-display text-[clamp(3rem,6vw,5.8rem)] leading-[.94] tracking-[-.055em] text-[#234b3b]">What are you<br />building <em className="font-normal text-[#8e9d66]">toward?</em></h2>
              <p className="mt-7 max-w-[360px] text-[14px] leading-[1.8] text-[#627369]">Tell us a little about your project. We’ll help you find the right first conversation.</p>
              <div className="mt-10 flex items-start gap-3 border-t border-[#203c32]/15 pt-5">
                <span className="mt-0.5 text-[#67815e]"><ArrowUpRight size={17} /></span>
                <p className="max-w-[300px] text-[12px] leading-[1.65] text-[#6e7e71]">No contact details are listed here yet. Use the form to prepare an inquiry you can copy and send through your preferred channel.</p>
              </div>
            </div>
            <div className="rounded-[1.8rem] border border-[#203c32]/12 bg-[#f7f6ed] p-6 sm:p-9">
              {!submitted ? (
                <form onSubmit={makeDraft} className="space-y-5">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <label className="block text-[11px] font-semibold text-[#536b5b]">Your name
                      <input required value={inquiry.name} onChange={(event) => setInquiry({ ...inquiry, name: event.target.value })} placeholder="Name" className="mt-2 w-full rounded-xl border border-[#d5ddcc] bg-[#fbfaf4] px-4 py-3.5 text-sm text-[#203c32] outline-none transition focus:border-[#67815e] focus:ring-2 focus:ring-[#67815e]/15" data-testid="input-name" />
                    </label>
                    <label className="block text-[11px] font-semibold text-[#536b5b]">Email address
                      <input required type="email" value={inquiry.email} onChange={(event) => setInquiry({ ...inquiry, email: event.target.value })} placeholder="you@example.com" className="mt-2 w-full rounded-xl border border-[#d5ddcc] bg-[#fbfaf4] px-4 py-3.5 text-sm text-[#203c32] outline-none transition focus:border-[#67815e] focus:ring-2 focus:ring-[#67815e]/15" data-testid="input-email" />
                    </label>
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <label className="block text-[11px] font-semibold text-[#536b5b]">Project type
                      <select value={inquiry.project} onChange={(event) => setInquiry({ ...inquiry, project: event.target.value })} className="mt-2 w-full rounded-xl border border-[#d5ddcc] bg-[#fbfaf4] px-4 py-3.5 text-sm text-[#203c32] outline-none focus:border-[#67815e]" data-testid="select-project">
                        <option>New building</option><option>Existing building</option><option>Interior fit-out</option><option>Campus or portfolio</option><option>Something else</option>
                      </select>
                    </label>
                    <label className="block text-[11px] font-semibold text-[#536b5b]">Project stage
                      <input value={inquiry.stage} onChange={(event) => setInquiry({ ...inquiry, stage: event.target.value })} placeholder="For example, concept design" className="mt-2 w-full rounded-xl border border-[#d5ddcc] bg-[#fbfaf4] px-4 py-3.5 text-sm text-[#203c32] outline-none focus:border-[#67815e]" data-testid="input-stage" />
                    </label>
                  </div>
                  <label className="block text-[11px] font-semibold text-[#536b5b]">What would be useful to talk through?
                    <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={4} placeholder="A few words about your goals, questions or timing..." className="mt-2 w-full resize-y rounded-xl border border-[#d5ddcc] bg-[#fbfaf4] px-4 py-3.5 text-sm text-[#203c32] outline-none focus:border-[#67815e]" data-testid="textarea-project" />
                  </label>
                  <button type="submit" className="group inline-flex items-center gap-3 rounded-full bg-[#214a3b] px-6 py-4 text-sm font-semibold text-[#f3f3e8] transition-colors hover:bg-[#183c2e]" data-testid="button-prepare-inquiry">
                    Prepare my inquiry <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                  </button>
                </form>
              ) : (
                <div>
                  <div className="mb-5 flex items-center gap-3 text-[#315b47]"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#dce7cc]"><Check size={17} /></span><h3 className="font-display text-[27px]">Your inquiry draft</h3></div>
                  <p className="mb-4 text-[12px] leading-relaxed text-[#718075]">Copy this message and send it using your preferred contact method.</p>
                  <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={9} className="w-full rounded-xl border border-[#d5ddcc] bg-[#fbfaf4] px-4 py-3.5 text-[13px] leading-relaxed text-[#365844] outline-none focus:border-[#67815e]" data-testid="textarea-inquiry-draft" />
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button onClick={copyDraft} className="inline-flex items-center gap-2 rounded-full bg-[#214a3b] px-5 py-3 text-sm font-semibold text-[#f3f3e8]" data-testid="button-copy-inquiry">{copied ? <><Check size={15} /> Copied</> : <>Copy inquiry <ArrowRight size={15} /></>}</button>
                    <button onClick={() => setSubmitted(false)} className="rounded-full border border-[#b9c6ac] px-5 py-3 text-sm font-semibold text-[#486958]" data-testid="button-edit-inquiry">Edit details</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-[#214a3b] px-5 py-8 text-[#e7edd9] sm:px-8 lg:px-14">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <a href="#top" className="flex items-center gap-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#dce4c9] text-[#315b47]"><Leaf size={16} /></span><span className="font-display text-[24px] tracking-[-.05em]">sanse green</span></a>
          <p className="text-[12px] text-[#c3d0bd]">Breathing life into sustainable buildings.</p>
          <a href="#top" className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.14em] text-[#dce4c9]">Back to top <ArrowUpRight size={14} /></a>
        </div>
        <div className="mx-auto mt-6 max-w-[1280px] border-t border-[#e7edd9]/20 pt-5 text-[10px] text-[#b6c7b8]">LEED certification consulting. Certification outcomes are determined by the applicable review body.</div>
      </footer>
    </div>
  );
}

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
