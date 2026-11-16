import { runEvaluationCli } from '../src/lib/events/eval-cli';
runEvaluationCli(process.argv.slice(2)).catch(error => {
  console.error(error instanceof Error ? error.message : 'Evaluation failed');
  process.exitCode = 1;
});
