"use client";

import { useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, ImagePlus, Send } from "lucide-react";

const postSchema = z.object({
  content: z.string().min(1, "Post content cannot be empty.").max(500, "Post content is too long."),
  imageUrl: z.string().url("Invalid image URL.").optional().or(z.literal("")),
});

type PostFormData = z.infer<typeof postSchema>;

interface CreatePostFormProps {
  onPostCreated: (content: string, imageUrl?: string) => Promise<void>;
}

export function CreatePostForm({ onPostCreated }: CreatePostFormProps) {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showImageUrlInput, setShowImageUrlInput] = useState(false);

  const form = useForm<PostFormData>({
    resolver: zodResolver(postSchema),
    defaultValues: {
      content: "",
      imageUrl: "",
    },
  });

  const onSubmit: SubmitHandler<PostFormData> = async (data) => {
    setIsSubmitting(true);
    await onPostCreated(data.content, data.imageUrl || undefined);
    form.reset();
    setShowImageUrlInput(false);
    setIsSubmitting(false);
  };

  if (!user) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Create a New Post</CardTitle>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <Label htmlFor="postContent" className="sr-only">What's on your mind?</Label>
                  <FormControl>
                    <Textarea
                      id="postContent"
                      placeholder={`What's on your mind, ${user.displayName || 'User'}?`}
                      {...field}
                      className="min-h-[100px] text-base"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {showImageUrlInput && (
              <FormField
                control={form.control}
                name="imageUrl"
                render={({ field }) => (
                  <FormItem>
                    <Label htmlFor="imageUrl">Image URL (Optional)</Label>
                    <FormControl>
                      <Input id="imageUrl" placeholder="https://example.com/image.png" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </CardContent>
          <CardFooter className="flex justify-between items-center">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setShowImageUrlInput(!showImageUrlInput)}
              aria-label={showImageUrlInput ? "Hide image URL input" : "Add image URL"}
            >
              <ImagePlus className="h-5 w-5" />
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Post
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
