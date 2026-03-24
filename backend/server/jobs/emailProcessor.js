/**
 * BullMQ Job Processor for email tasks
 */

const { Worker } = require('bullmq');

const emailWorker = new Worker('email', async (job) => {
  console.log(`Processing email job: ${job.id}`);
  // TODO: Implement email sending with inbox rotation
  return { success: true };
}, {
  connection: {
    host: 'localhost',
    port: 6379
  }
});

emailWorker.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed: ${err.message}`);
});

module.exports = emailWorker;
