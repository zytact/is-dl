/** Scaffolding for `is-dl resume init`. Generic on purpose: no personal data. */

export const TEMPLATE_PREAMBLE = `\\documentclass[8pt, letterpaper]{article}

% Packages:
\\usepackage[
    ignoreheadfoot, % set margins without considering header and footer
    top=0.75 cm, % seperation between body and page edge from the top
    bottom=0.75 cm, % seperation between body and page edge from the bottom
    left=1 cm, % seperation between body and page edge from the left
    right=1 cm, % seperation between body and page edge from the right
    footskip=1.0 cm, % seperation between body and footer
    % showframe % for debugging
]{geometry} % for adjusting page geometry
\\usepackage{titlesec} % for customizing section titles
\\usepackage{tabularx} % for making tables with fixed width columns
\\usepackage{array} % tabularx requires this
\\usepackage[dvipsnames]{xcolor} % for coloring text
\\definecolor{primaryColor}{RGB}{0, 0, 0} % define primary color
\\usepackage{enumitem} % for customizing lists
\\usepackage{fontawesome5} % for using icons
\\usepackage{amsmath} % for math
\\usepackage[
    pdftitle={Your Name's CV},
    pdfauthor={Your Name},
    pdfcreator={LaTeX with RenderCV},
    colorlinks=true,
    urlcolor=primaryColor
]{hyperref} % for links, metadata and bookmarks
\\usepackage[pscoord]{eso-pic} % for floating text on the page
\\usepackage{calc} % for calculating lengths
\\usepackage{bookmark} % for bookmarks
\\usepackage{lastpage} % for getting the total number of pages
\\usepackage{changepage} % for one column entries (adjustwidth environment)
\\usepackage{paracol} % for two and three column entries
\\usepackage{ifthen} % for conditional statements
\\usepackage{needspace} % for avoiding page brake right after the section title
\\usepackage{iftex} % check if engine is pdflatex, xetex or luatex

% Ensure that generate pdf is machine readable/ATS parsable:
\\ifPDFTeX
    \\input{glyphtounicode}
    \\pdfgentounicode=1
    \\usepackage[T1]{fontenc}
    \\usepackage[utf8]{inputenc}
    \\usepackage{lmodern}
\\fi

\\ifPDFTeX
    \\usepackage{charter}
\\else
    \\usepackage{fontspec}
    \\setmainfont{XCharter}[
        Extension = .otf,
        UprightFont = *-Roman,
        BoldFont = *-Bold,
        ItalicFont = *-Italic,
        BoldItalicFont = *-BoldItalic,
    ]
\\fi

% Some settings:
\\raggedright
\\AtBeginEnvironment{adjustwidth}{\\partopsep0pt} % remove space before adjustwidth environment
\\pagestyle{empty} % no header or footer
\\setcounter{secnumdepth}{0} % no section numbering
\\setlength{\\parindent}{0pt} % no indentation
\\setlength{\\topskip}{0pt} % no top skip
\\setlength{\\columnsep}{0.15cm} % set column seperation
\\pagenumbering{gobble} % no page numbering

\\titleformat{\\section}{\\needspace{4\\baselineskip}\\bfseries\\large}{}{0pt}{}[\\vspace{1pt}\\titlerule]

\\titlespacing{\\section}{
    % left space:
    -1pt
}{
    % top space:
    0.12 cm
}{
    % bottom space:
    0.04 cm
} % section title spacing

\\renewcommand\\labelitemi{$\\vcenter{\\hbox{\\small$\\bullet$}}$} % custom bullet points
\\newenvironment{highlights}{
    \\begin{itemize}[
        topsep=0.06 cm,
        parsep=0.06 cm,
        partopsep=0pt,
        itemsep=0pt,
        leftmargin=0 cm + 10pt
    ]
}{
    \\end{itemize}
} % new environment for highlights


\\newenvironment{highlightsforbulletentries}{
    \\begin{itemize}[
        topsep=0.06 cm,
        parsep=0.06 cm,
        partopsep=0pt,
        itemsep=0pt,
        leftmargin=10pt
    ]
}{
    \\end{itemize}
} % new environment for highlights for bullet entries

\\newenvironment{onecolentry}{
    \\begin{adjustwidth}{
        0 cm + 0.00001 cm
    }{
        0 cm + 0.00001 cm
    }
}{
    \\end{adjustwidth}
} % new environment for one column entries

\\newenvironment{twocolentry}[2][]{
    \\onecolentry
    \\def\\secondColumn{#2}
    \\setcolumnwidth{\\fill, 4.5 cm}
    \\begin{paracol}{2}
}{
    \\switchcolumn \\raggedleft \\secondColumn
    \\end{paracol}
    \\endonecolentry
} % new environment for two column entries

\\newenvironment{threecolentry}[3][]{
    \\onecolentry
    \\def\\thirdColumn{#3}
    \\setcolumnwidth{, \\fill, 4.5 cm}
    \\begin{paracol}{3}
    {\\raggedright #2} \\switchcolumn
}{
    \\switchcolumn \\raggedleft \\thirdColumn
    \\end{paracol}
    \\endonecolentry
} % new environment for three column entries

\\newenvironment{header}{
    \\setlength{\\topsep}{0pt}\\par\\kern\\topsep\\centering\\linespread{1.5}
}{
    \\par\\kern\\topsep
} % new environment for the header

\\newcommand{\\placelastupdatedtext}{% \\placetextbox{<horizontal pos>}{<vertical pos>}{<stuff>}
  \\AddToShipoutPictureFG*{% Add <stuff> to current page foreground
    \\put(
        \\LenToUnit{\\paperwidth-2 cm-0 cm+0.05cm},
        \\LenToUnit{\\paperheight-1.0 cm}
    ){\\vtop{{\\null}\\makebox[0pt][c]{
        \\small\\color{gray}\\textit{Last updated in May 2026}\\hspace{\\widthof{Last updated in May 2026}}
    }}}%
  }%
}%

% save the original href command in a new command:
\\let\\hrefWithoutArrow\\href

% new command for external links:

% Separator between header contact items. The RenderCV original used
% \\cleaders, which XeTeX rejects with "Leaders not followed by proper glue".
% The generator emits this only between items, never leading.
\\newcommand{\\AND}{\\unskip\\ \\textbar\\ \\ignorespaces}

\\begin{document}
`;

export const TEMPLATE_RESUME = `# Prose fields (bullet text, and the text of a labelled item) take a small
# markup: **bold** for keywords and [text](url) for links. A backslash escapes
# the next character, so '\\**not bold\\**' keeps the asterisks literal.
# Quote any value holding a '#', or YAML reads the rest of the line as a comment.
basics:
  name: Your Name
  headline: Software Engineer
  location: City, Country
  contacts:
    - icon: faEnvelope
      text: you@example.com
      url: mailto:you@example.com
    - icon: faGithub
      text: github.com/you
      url: https://github.com/you

sections:
  - id: education
    title: Education
    items:
      - id: edu-university
        role: Your University
        org: Bachelor of Technology in Something
        right: Aug 2023 - May 2027
        tags: []
        bullets: []
      - id: edu-coursework
        label: Relevant Coursework
        text: Data Structures, Operating Systems, DBMS
        tags: []

  - id: experience
    title: Experience
    items:
      - id: exp-example
        role: Software Engineer Intern
        org: Example Co
        right: Jan 2026 - Mar 2026
        tags: [typescript, react]
        bullets:
          - id: exp-example-1
            text: 'Write what you actually did, in your own words, using **TypeScript** and **React**. ([PR #12](https://github.com/example/repo/pull/12))'
            tags: [typescript, react]

  - id: skills
    title: Technical Skills
    items:
      - id: skills-languages
        label: Programming Languages
        text: TypeScript, Python
        tags: [typescript, python]
`;

export const TEMPLATE_VARIANTS = `# A variant is a headline, a section order, and selection.
# lead pulls ids to the top of their section, drop removes ids entirely,
# tags keeps only bullets carrying at least one of those tags.
variants:
  default:
    headline: Software Engineer
    sections: [education, experience, skills]
    lead: []
    drop: []
    tags: []
`;
