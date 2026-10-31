'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { FormError, FormField } from '@/components/form-field';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { Project } from '@/lib/api/types';
import { errorMessage } from '@/lib/api/errors';
import { useCreateProject, useUpdateProject } from '@/lib/queries';
import { projectSchema, type ProjectValues } from '@/lib/schemas';

interface ProjectFormDialogProps {
  orgId: string;
  // Present: edit this project. Absent: create a new one.
  project?: Project;
  variant?: 'default' | 'outline';
}

export function ProjectFormDialog({ orgId, project, variant = 'default' }: ProjectFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string>();
  const create = useCreateProject(orgId);
  const update = useUpdateProject(orgId, project?.id ?? '');
  const mutation = project ? update : create;

  const defaults: ProjectValues = {
    name: project?.name ?? '',
    department: project?.department ?? '',
    description: project?.description ?? '',
  };
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProjectValues>({ resolver: zodResolver(projectSchema), defaultValues: defaults });

  const onSubmit = handleSubmit((values) => {
    setFormError(undefined);
    const done = {
      onSuccess: () => {
        toast.success(project ? 'Project updated' : 'Project created');
        setOpen(false);
        if (!project) {
          reset(defaults);
        }
      },
      onError: (error: unknown) => setFormError(errorMessage(error)),
    };

    if (project) {
      // Editing: an emptied box means "clear this field", which the API expresses as null.
      update.mutate(
        {
          name: values.name,
          department: values.department || null,
          description: values.description || null,
        },
        done,
      );
    } else {
      // Creating: an empty box means "not given", so the field is left out.
      create.mutate(
        {
          name: values.name,
          ...(values.department && { department: values.department }),
          ...(values.description && { description: values.description }),
        },
        done,
      );
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          // Start from the current values each time the dialog opens.
          reset(defaults);
          setFormError(undefined);
        }
      }}
    >
      <DialogTrigger render={<Button variant={variant} />}>
        {project ? 'Edit' : 'New project'}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{project ? 'Edit project' : 'Create a project'}</DialogTitle>
          <DialogDescription>
            {project
              ? 'Change the details below.'
              : 'Projects group the tasks of one piece of work.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void onSubmit(event)} noValidate className="grid gap-4">
          <FormError message={formError} />
          <FormField id="project-name" label="Name" error={errors.name?.message}>
            <Input
              id="project-name"
              autoFocus
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'project-name-error' : undefined}
              {...register('name')}
            />
          </FormField>
          <FormField
            id="project-department"
            label="Department (optional)"
            error={errors.department?.message}
          >
            <Input
              id="project-department"
              placeholder="Marketing"
              aria-invalid={!!errors.department}
              aria-describedby={errors.department ? 'project-department-error' : undefined}
              {...register('department')}
            />
          </FormField>
          <FormField
            id="project-description"
            label="Description (optional)"
            error={errors.description?.message}
          >
            <Textarea
              id="project-description"
              rows={4}
              aria-invalid={!!errors.description}
              aria-describedby={errors.description ? 'project-description-error' : undefined}
              {...register('description')}
            />
          </FormField>
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : project ? 'Save changes' : 'Create project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
