const _ = require('underscore');
const lodashThrottle = require('lodash/throttle');
const CONST = require('../../../libs/CONST');
const ActionUtils = require('../../../libs/ActionUtils');
const GitHubUtils = require('../../../libs/GithubUtils');
const {promiseDoWhile} = require('../../../libs/promiseWhile');

function run() {
    console.info('[awaitStagingDeploys] run()');
    console.info('[awaitStagingDeploys] ActionUtils', ActionUtils);
    console.info('[awaitStagingDeploys] GitHubUtils', GitHubUtils);
    console.info('[awaitStagingDeploys] promiseDoWhile', promiseDoWhile);

    const tag = ActionUtils.getStringInput('TAG', {required: false});
    console.info('[awaitStagingDeploys] run() tag', tag);

    let currentStagingDeploys = [];

    console.info('[awaitStagingDeploys] run()  _.throttle', _.throttle);

    const throttleFunc = () =>
        Promise.all([
            // These are active deploys
            GitHubUtils.octokit.actions.listWorkflowRuns({
                owner: CONST.GITHUB_OWNER,
                repo: CONST.APP_REPO,
                workflow_id: 'platformDeploy.yml',
                event: 'push',
                branch: tag,
            }),

            // These have the potential to become active deploys, so we need to wait for them to finish as well (unless we're looking for a specific tag)
            // In this context, we'll refer to unresolved preDeploy workflow runs as staging deploys as well
            !tag &&
                GitHubUtils.octokit.actions.listWorkflowRuns({
                    owner: CONST.GITHUB_OWNER,
                    repo: CONST.APP_REPO,
                    workflow_id: 'preDeploy.yml',
                }),
        ])
            .then((responses) => {
                const workflowRuns = responses[0].data.workflow_runs;
                if (!tag) {
                    workflowRuns.push(...responses[1].data.workflow_runs);
                }
                return workflowRuns;
            })
            .then((workflowRuns) => (currentStagingDeploys = _.filter(workflowRuns, (workflowRun) => workflowRun.status !== 'completed')))
            .then(() =>
                console.log(
                    _.isEmpty(currentStagingDeploys)
                        ? 'No current staging deploys found'
                        : `Found ${currentStagingDeploys.length} staging deploy${currentStagingDeploys.length > 1 ? 's' : ''} still running...`,
                ),
            );
    console.info('[awaitStagingDeploys] run() throttleFunc', throttleFunc);

    return promiseDoWhile(
        () => !_.isEmpty(currentStagingDeploys),
        lodashThrottle(
            throttleFunc,

            // Poll every 60 seconds instead of every 10 seconds
            GitHubUtils.POLL_RATE * 6,
        ),
    );
}

if (require.main === module) {
    run();
}

module.exports = run;
