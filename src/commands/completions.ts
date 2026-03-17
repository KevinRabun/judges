// ─── Shell Completions Generator ─────────────────────────────────────────────
// Generate shell completion scripts for bash, zsh, fish, and PowerShell.
//
// Usage:
//   judges completions bash >> ~/.bashrc
//   judges completions zsh >> ~/.zshrc
//   judges completions fish > ~/.config/fish/completions/judges.fish
//   judges completions powershell >> $PROFILE
// ──────────────────────────────────────────────────────────────────────────────

import { getJudgeSummaries } from "../judges/index.js";

const COMMANDS = [
  "eval",
  "list",
  "init",
  "fix",
  "watch",
  "report",
  "hook",
  "diff",
  "deps",
  "baseline",
  "ci-templates",
  "completions",
  "docs",
  "skill",
  "skills",
];
const FORMATS = ["text", "json", "sarif", "markdown", "html", "junit", "codeclimate"];
const PRESETS = ["strict", "lenient", "security-only", "startup"];

function getJudgeIds(): string[] {
  return getJudgeSummaries().map((j) => j.id);
}

function getSkillIds(): string[] {
  try {
    const { listSkills } = require("../skill-loader.js") as { listSkills: (dir: string) => { id: string }[] };
    const { resolve } = require("node:path");
    const skillsDir = resolve(__dirname, "..", "..", "skills");
    const skills = listSkills(skillsDir);
    return skills.map((s) => s.id);
  } catch {
    return [];
  }
}

function generateBash(): string {
  const judgeIds = getJudgeIds().join(" ");
  const skillIds = getSkillIds().join(" ");
  void skillIds; // satisfy lint
  return `# judges shell completions for bash
# Add to ~/.bashrc: eval "$(judges completions bash)"

_judges_completions() {
  local cur prev commands formats judges presets
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  commands="${COMMANDS.join(" ")}"
  formats="${FORMATS.join(" ")}"
  judges="${judgeIds}"
  presets="${PRESETS.join(" ")}"
  skills="${skillIds}"

  case "\${prev}" in
    judges)
      COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )
      return 0
      ;;
    --format|-o)
      COMPREPLY=( $(compgen -W "\${formats}" -- "\${cur}") )
      return 0
      ;;
    --judge|-j)
      COMPREPLY=( $(compgen -W "\${judges}" -- "\${cur}") )
      return 0
      ;;
    --preset)
      COMPREPLY=( $(compgen -W "\${presets}" -- "\${cur}") )
      return 0
      ;;
    --skill|-S)
      COMPREPLY=( $(compgen -W "\${skills}" -- "\${cur}") )
      return 0
      ;;
    --file|-f|--baseline|-b|--config|--output)
      COMPREPLY=( $(compgen -f -- "\${cur}") )
      return 0
      ;;
  esac

  if [[ "\${cur}" == -* ]]; then
    COMPREPLY=( $(compgen -W "--file --language --format --judge --skill --skills-dir --help --fail-on-findings --baseline --summary --apply --preset --config --min-score --no-color --verbose --quiet" -- "\${cur}") )
  else
    COMPREPLY=( $(compgen -W "\${commands} ${skillIds}" -- "\${cur}") )
  fi
}

complete -F _judges_completions judges
`;
}

function generateZsh(): string {
  const judgeIds = getJudgeIds().join(" ");
  const skillIds = getSkillIds().join(" ");
  void skillIds;
  return `# judges shell completions for zsh
# Add to ~/.zshrc: eval "$(judges completions zsh)"

_judges() {
  local -a commands formats judges presets
  commands=(${COMMANDS.map((c) => `'${c}'`).join(" ")})
  formats=(${FORMATS.map((f) => `'${f}'`).join(" ")})
  judges=(${judgeIds})
  presets=(${PRESETS.map((p) => `'${p}'`).join(" ")})

  _arguments \\
    '1:command:compadd -a commands' \\
    '--file[File to evaluate]:file:_files' \\
    '-f[File to evaluate]:file:_files' \\
    '--language[Language override]:language:(typescript javascript python rust go java csharp ruby php swift kotlin scala c cpp yaml json terraform dockerfile bash)' \\
    '-l[Language override]:language:(typescript javascript python rust go java csharp ruby php swift kotlin scala c cpp yaml json terraform dockerfile bash)' \\
    '--format[Output format]:format:compadd -a formats' \\
    '-o[Output format]:format:compadd -a formats' \\
    '--judge[Specific judge]:judge:compadd -a judges' \\
    '-j[Specific judge]:judge:compadd -a judges' \\
    '--skill[Skill id]:skill:compadd -a skills' \\
    '-S[Skill id]:skill:compadd -a skills' \\
    '--skills-dir[Skills directory]:skills-dir:_files' \\
    '--preset[Config preset]:preset:compadd -a presets' \\
    '--config[Config file]:config:_files' \\
    '--baseline[Baseline file]:baseline:_files' \\
    '-b[Baseline file]:baseline:_files' \\
    '--help[Show help]' \\
    '--fail-on-findings[Exit 1 on findings]' \\
    '--summary[One-line summary]' \\
    '--apply[Apply fixes]' \\
    '--min-score[Minimum score threshold]:score:' \\
    '--no-color[Disable colors]' \\
    '--verbose[Verbose output]' \\
    '--quiet[Suppress non-essential output]' \\
    '*:file:_files'
}

compdef _judges judges
`;
}

function generateFish(): string {
  const judgeIds = getJudgeIds();
  const skillIds = getSkillIds();
  void skillIds;
  const lines = [
    "# judges shell completions for fish",
    "# Save to ~/.config/fish/completions/judges.fish",
    "",
    "# Commands",
  ];
  for (const cmd of COMMANDS) {
    lines.push(`complete -c judges -n '__fish_use_subcommand' -a '${cmd}' -d '${cmd} command'`);
  }
  lines.push("");
  lines.push("# Flags");
  lines.push("complete -c judges -l file -s f -rF -d 'File to evaluate'");
  lines.push("complete -c judges -l language -s l -r -d 'Language override'");
  lines.push(`complete -c judges -l format -s o -r -a '${FORMATS.join(" ")}' -d 'Output format'`);
  lines.push(`complete -c judges -l judge -s j -r -a '${judgeIds.join(" ")}' -d 'Specific judge'`);
  lines.push(`complete -c judges -l skill -s S -r -a '${skillIds.join(" ")}' -d 'Skill identifier'`);
  lines.push(`complete -c judges -l skills-dir -rF -d 'Skills directory'`);
  lines.push(`complete -c judges -l preset -r -a '${PRESETS.join(" ")}' -d 'Config preset'`);
  lines.push("complete -c judges -l config -rF -d 'Config file'");
  lines.push("complete -c judges -l baseline -s b -rF -d 'Baseline file'");
  lines.push("complete -c judges -l help -s h -d 'Show help'");
  lines.push("complete -c judges -l fail-on-findings -d 'Exit 1 on findings'");
  lines.push("complete -c judges -l summary -d 'One-line summary'");
  lines.push("complete -c judges -l apply -s a -d 'Apply fixes'");
  lines.push("complete -c judges -l min-score -r -d 'Minimum score'");
  lines.push("complete -c judges -l no-color -d 'Disable colors'");
  lines.push("complete -c judges -l verbose -d 'Verbose output'");
  lines.push("complete -c judges -l quiet -d 'Suppress output'");
  lines.push("");
  return lines.join("\n");
}

function generatePowerShell(): string {
  const judgeIds = getJudgeIds();
  const skillIds = getSkillIds();
  void skillIds;
  return `# judges shell completions for PowerShell
# Add to $PROFILE: judges completions powershell | Invoke-Expression

Register-ArgumentCompleter -CommandName judges -ScriptBlock {
  param($wordToComplete, $commandAst, $cursorPosition)

  $commands = @(${COMMANDS.map((c) => `'${c}'`).join(", ")})
  $formats = @(${FORMATS.map((f) => `'${f}'`).join(", ")})
  $judges = @(${judgeIds.map((j) => `'${j}'`).join(", ")})
  $presets = @(${PRESETS.map((p) => `'${p}'`).join(", ")})
  $flags = @('--file', '--language', '--format', '--judge', '--help', '--fail-on-findings', '--baseline', '--summary', '--apply', '--preset', '--config', '--min-score', '--no-color', '--verbose', '--quiet')

  $elements = $commandAst.CommandElements
  $prev = if ($elements.Count -ge 2) { $elements[$elements.Count - 2].Value } else { '' }

  switch ($prev) {
    { $_ -in '--format', '-o' } { $formats | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) } }
    { $_ -in '--judge', '-j' } { $judges | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) } }
    { $_ -eq '--preset' } { $presets | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) } }
    { $_ -eq 'judges' } { $commands | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) } }
    default {
      if ($wordToComplete.StartsWith('-')) {
        $flags | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
      } else {
        $commands | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
      }
    }
  }
}
`;
}

// ─── CLI Entry Point ────────────────────────────────────────────────────────

export function runCompletions(argv: string[]): void {
  const shell = argv[3];

  if (!shell || shell === "--help" || shell === "-h") {
    console.log(`
Judges Panel — Shell Completions

USAGE:
  judges completions bash        Generate bash completions
  judges completions zsh         Generate zsh completions
  judges completions fish        Generate fish completions
  judges completions powershell  Generate PowerShell completions

SETUP:
  judges completions bash >> ~/.bashrc
  judges completions zsh >> ~/.zshrc
  judges completions fish > ~/.config/fish/completions/judges.fish
  judges completions powershell >> $PROFILE
`);
    process.exit(0);
  }

  switch (shell) {
    case "bash":
      console.log(generateBash());
      break;
    case "zsh":
      console.log(generateZsh());
      break;
    case "fish":
      console.log(generateFish());
      break;
    case "powershell":
    case "pwsh":
      console.log(generatePowerShell());
      break;
    default:
      console.error(`Unknown shell: ${shell}`);
      console.error("Supported: bash, zsh, fish, powershell");
      process.exit(1);
  }

  process.exit(0);
}
