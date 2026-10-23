// Keep the original response stream alive while the user reviews an intervention.
// Closing it on pause makes the client advance to the next snippet too early.
export async function continueAfterApprovals(manager, signal) {
  while (manager.pendingImpromptuPhase && manager.isWaitingForApproval && !signal?.aborted) {
    await manager.waitForImpromptuDecision(signal);
    if (signal?.aborted) return;
    const lastMessage = manager.getLastMessage();
    await manager.continueConversation(
      manager.currentParticipants,
      lastMessage?.sender || manager.currentInitiator,
      lastMessage?.recipient || 'All',
      false,
    );
  }
}
