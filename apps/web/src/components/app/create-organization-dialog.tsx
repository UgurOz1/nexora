'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
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
import { errorMessage } from '@/lib/api/errors';
import { useCreateOrganization } from '@/lib/queries';
import { organizationSchema, type OrganizationValues } from '@/lib/schemas';

export function CreateOrganizationDialog({ label = 'New organization' }: { label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string>();
  const create = useCreateOrganization();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<OrganizationValues>({
    resolver: zodResolver(organizationSchema),
    defaultValues: { name: '' },
  });

  const onSubmit = handleSubmit(({ name }) => {
    setFormError(undefined);
    create.mutate(name, {
      onSuccess: (organization) => {
        toast.success(`Created ${organization.name}`);
        setOpen(false);
        reset();
        router.push(`/orgs/${organization.id}`);
      },
      onError: (error) => setFormError(errorMessage(error)),
    });
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>{label}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create an organization</DialogTitle>
          <DialogDescription>
            An organization is a company or team. You become its owner and can invite the others.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void onSubmit(event)} noValidate className="grid gap-4">
          <FormError message={formError} />
          <FormField id="org-name" label="Name" error={errors.name?.message}>
            <Input
              id="org-name"
              autoFocus
              placeholder="Acme Software"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'org-name-error' : undefined}
              {...register('name')}
            />
          </FormField>
          <DialogFooter>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create organization'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
