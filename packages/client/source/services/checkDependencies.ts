import {execSync} from 'child_process';
import chalk from 'chalk';

interface DependencyCheck {
  name: string;
  command: string;
  installHint: {
    linux: string;
    macos: string;
    windows: string;
    wsl: string;
  };
}

const REQUIRED_DEPENDENCIES: DependencyCheck[] = [
  {
    name: 'ffmpeg',
    command: 'ffmpeg -version',
    installHint: {
      linux: 'Ubuntu/Debian: sudo apt install ffmpeg\nFedora: sudo dnf install ffmpeg',
      macos: 'brew install ffmpeg',
      windows: 'choco install ffmpeg',
      wsl: 'In WSL terminal: sudo apt update && sudo apt install ffmpeg',
    },
  },
  {
    name: 'yt-dlp',
    command: 'yt-dlp --version',
    installHint: {
      linux: 'pip install --user yt-dlp OR sudo apt install yt-dlp',
      macos: 'brew install yt-dlp',
      windows: 'choco install yt-dlp',
      wsl: 'In WSL terminal: pip install --user yt-dlp',
    },
  },
];

function detectPlatform(): string {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'macos';
  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) return 'wsl';
  return 'linux';
}

export function checkDependencies(): boolean {
  const platform = detectPlatform();
  const missingDeps: string[] = [];

  console.log('\n' + chalk.bold.blue('Checking dependencies...'));

  for (const dep of REQUIRED_DEPENDENCIES) {
    try {
      execSync(dep.command, {stdio: 'pipe'});
      console.log(chalk.green(`✓ ${dep.name} is installed`));
    } catch {
      console.log(chalk.red(`✗ ${dep.name} is not installed`));
      missingDeps.push(dep.name);
    }
  }

  if (missingDeps.length > 0) {
    console.log(
      '\n' +
        chalk.bold.red('Missing dependencies detected!') +
        '\n' +
        chalk.yellow('Please install the following:'),
    );

    for (const dep of REQUIRED_DEPENDENCIES) {
      if (missingDeps.includes(dep.name)) {
        console.log(`\n${chalk.bold(dep.name)}:`);
        const hint =
          dep.installHint[platform as keyof DependencyCheck['installHint']] ||
          dep.installHint.linux;
        console.log(chalk.cyan(hint));
      }
    }

    console.log(
      '\n' +
        chalk.yellow(
          'For more details, visit: https://github.com/Misterr-H/goofyy#prerequisites',
        ) +
        '\n',
    );
    return false;
  }

  console.log(
    chalk.bold.green('\nAll dependencies are installed! You can use Goofyy now.\n'),
  );
  return true;
}
