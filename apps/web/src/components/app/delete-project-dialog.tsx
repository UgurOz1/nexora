'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { FormError } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { Project } from '@/lib/api/types';
import { errorMessage } from '@/lib/api/errors';
import { useDeleteProject } from '@/lib/queries';

export function DeleteProjectDialog({ orgId, project }: { orgId: string; project: Project }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string>();
  const remove = useDeleteProject(orgId, project.id);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="destructive" />}>Delete</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete “{project.name}”?</DialogTitle>
          <DialogDescription>
            The project and its {project.taskCount} {project.taskCount === 1 ? 'task' : 'tasks'}{' '}
            will disappear from NEXORA for everyone.
          </DialogDescription>
        </DialogHeader>
        <FormError message={formError} />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={remove.isPending}
            onClick={() =>
              remove.mutate(undefined, {
                onSuccess: () => {
                  toast.success('Project deleted');
                  router.replace(`/orgs/${orgId}`);
                },
                onError: (error) => setFormError(errorMessage(error)),
              })
            }
          >
            {remove.isPending ? 'Deleting…' : 'Delete project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
