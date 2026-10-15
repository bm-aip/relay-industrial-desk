import { DomainError, id, sendQuote } from './domain.mjs';
import { assertCommercial } from './workflow.mjs';

export function deliveryJob(e, t, kind, actor) {
  if (t.config.paused) throw new DomainError('Dispatch is paused for this workspace.', 409);
  if (kind === 'quote') {
    if (e.status !== 'approved' || e.quote?.approvedRevision !== e.quote?.revision) throw new DomainError('Approve the current revision before queueing.', 409);
    assertCommercial(e, t);
  } else if (e.status !== 'sent' || !e.followup || e.followup.status === 'cancelled' || e.conversationHold) {
    throw new DomainError('This follow-up is cancelled, held or no longer eligible.', 409);
  }
  const connector = t.connectors.find((c) => c.enabled && c.kind === 'channel' && c.name === e.outboundChannel && c.capabilities.includes('send_message'));
  if (!connector) throw new DomainError('Choose an available outbound channel.');
  // Only the implemented adapter can create an effect. Presets never imply connectivity.
  if (connector.mode !== 'simulation') throw new DomainError('This provider has no verified live adapter.', 409);
  return { id: id('job'), key: [t.id, e.id, e.quote.revision, kind, kind === 'followup' ? e.followup.dueAt : ''].join(':'),
    customerId: t.id, enquiryId: e.id, revision: e.quote.revision, connectorId: connector.id,
    kind, mode: 'simulation', actor, status: 'queued', attempts: 0,
    createdAt: new Date().toISOString(), dueAt: kind === 'followup' ? e.followup.dueAt : new Date().toISOString() };
}

export function processJobs(store, now = new Date()) {
  for (const j of store.jobs().filter((j) => j.status === 'queued' && new Date(j.dueAt) <= now)) {
    try {
      store.mutate(j.customerId, (t) => {
        const e = t.enquiries.find((e) => e.id === j.enquiryId);
        if (!e || e.quote?.revision !== j.revision || e.conversationHold || ['won', 'lost'].includes(e.status)) {
          j.status = 'cancelled'; j.result = 'Conversation or revision changed before dispatch.';
        } else if (t.config.paused) {
          return { value: null }; // Leave queued so an explicit resume can release it.
        } else {
          const eligibleStatus = j.kind === 'quote' ? e.status === 'approved' : e.status === 'sent';
          if (!eligibleStatus) throw new DomainError('Quote state changed; review this job.');
          assertCommercial(e, t, j.kind === 'followup');
          const c = t.connectors.find((c) => c.id === j.connectorId && c.enabled && c.mode === 'simulation' && c.name === e.outboundChannel && c.capabilities.includes('send_message'));
          if (!c) throw new DomainError('The queued outbound adapter changed or is unavailable.');
          j.attempts++;
          if (j.kind === 'quote') {
            sendQuote(e, t); e.simulated = true;
            const followup = deliveryJob(e, t, 'followup', j.actor);
            // The quote state and scheduled follow-up are committed together.
            j.status = 'simulated'; j.completedAt = now.toISOString();
            store.saveJob(j);
            e.version++;
            return { jobs: [followup], event: { type: 'delivery.simulated', subject: e.reference,
              detail: 'Quote revision ' + j.revision + ' simulated. No external message sent.' } };
          }
          if (e.status !== 'sent' || !e.followup || e.followup.status === 'cancelled') {
            j.status = 'cancelled'; j.result = 'Follow-up no longer eligible.';
          } else if (e.followup.sentAt) {
            j.status = 'simulated'; j.result = 'Already recorded; duplicate suppressed.';
          } else {
            e.followup.sentAt = now.toISOString(); e.followup.status = 'sent'; e.version++;
            j.status = 'simulated'; j.completedAt = now.toISOString();
          }
        }
        store.saveJob(j);
        return { event: { type: 'job.' + j.status, subject: e?.reference || j.enquiryId, detail: j.result || 'Simulated follow-up; no external message sent.' } };
      }, j.actor);
    } catch (error) {
      j.status = 'held'; j.result = error instanceof DomainError ? error.message : 'Processing failed; operator review required.';
      store.saveJob(j);
    }
  }
}
