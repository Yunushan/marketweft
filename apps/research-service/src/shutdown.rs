use std::io;
use std::sync::Arc;
use tokio::sync::{Notify, OwnedSemaphorePermit, Semaphore, TryAcquireError};

/// Controls admission and tracks when the last admitted worker releases its slot.
#[derive(Clone)]
pub struct ResearchShutdown {
    slots: Arc<Semaphore>,
    capacity: usize,
    released: Arc<Notify>,
}

impl ResearchShutdown {
    /// Create a shared admission budget for a research listener.
    pub fn new(slots: usize) -> io::Result<Self> {
        if !(1..=crate::MAX_RESEARCH_SLOTS).contains(&slots) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Set between one and eight research slots.",
            ));
        }
        Ok(Self {
            slots: Arc::new(Semaphore::new(slots)),
            capacity: slots,
            released: Arc::new(Notify::new()),
        })
    }

    /// Stop new admissions while existing workers keep their permits.
    pub fn stop_admitting(&self) {
        self.slots.close();
    }

    /// Wait until all admitted workers finish.
    pub async fn drained(&self) {
        loop {
            let released = self.released.notified();
            tokio::pin!(released);
            released.as_mut().enable();
            if self.slots.available_permits() == self.capacity {
                return;
            }
            released.await;
        }
    }

    pub(crate) fn try_acquire(&self) -> Result<ResearchPermit, TryAcquireError> {
        Arc::clone(&self.slots)
            .try_acquire_owned()
            .map(|permit| ResearchPermit {
                acquired: Some(permit),
                released: Arc::clone(&self.released),
            })
    }
}

pub(crate) struct ResearchPermit {
    acquired: Option<OwnedSemaphorePermit>,
    released: Arc<Notify>,
}

impl Drop for ResearchPermit {
    fn drop(&mut self) {
        drop(self.acquired.take());
        self.released.notify_waiters();
    }
}
