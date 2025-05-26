
"use client";

import { useState, useRef } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { Loader2, ImagePlus, Send, XCircle } from "lucide-react";
import Image from "next/image";

const postSchema = z.object({
  content: z.string().min(1, "Post content cannot be empty.").max(500, "Post content is too long."),
  // imageUrl will now store a data URI if an image is uploaded
  imageUrl: z.string().optional().or(z.literal("")),
});

type PostFormData = z.infer<typeof postSchema>;

interface CreatePostFormProps {
  onPostCreated: (content: string, imageUrl?: string) => Promise<void>;
}

export function CreatePostForm({ onPostCreated }: CreatePostFormProps) {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const form = useForm<PostFormData>({
    resolver: zodResolver(postSchema),
    defaultValues: {
      content: "",
      imageUrl: "",
    },
  });

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setImagePreview(result);
        form.setValue("imageUrl", result); // Store data URI in form
      };
      reader.onerror = () => {
        toast({
          title: "Image Read Error",
          description: "Could not read the selected image file.",
          variant: "destructive",
        });
        setImagePreview(null);
        setImageFile(null);
        form.setValue("imageUrl", "");
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
      }
      reader.readAsDataURL(file);
    } else {
      setImagePreview(null);
      setImageFile(null);
      form.setValue("imageUrl", "");
    }
  };

  const removeImage = () => {
    setImagePreview(null);
    setImageFile(null);
    form.setValue("imageUrl", "");
    if (fileInputRef.current) {
      fileInputRef.current.value = ""; // Reset the file input
    }
  };

  const onSubmit: SubmitHandler<PostFormData> = (data) => {
    setIsSubmitting(true);
    // PRODUCTION NOTE: For a production app, instead of sending a potentially large data URI,
    // you would typically upload the imageFile to a service like Firebase Storage,
    // get back a public URL, and then pass that URL to onPostCreated.
    // For this prototype, we'll use the data.imageUrl (which is the data URI).

    // The imageUrl from form (data.imageUrl) is already the data URI
    onPostCreated(data.content, data.imageUrl || undefined)
      .catch((error) => {
        console.error("Error during post submission process:", error);
      })
      .finally(() => {
        // This will be called after onPostCreated finishes (success or fail)
        // However, we want the UI to feel responsive faster.
      });

    toast({
      title: "Submitting Post",
      description: "Your post is being sent...",
    });
    
    form.reset();
    removeImage(); // Clear image preview and file state
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
            
            <FormItem>
              <Label htmlFor="imageUpload">Add Image (Optional)</Label>
              <FormControl>
                <Input 
                  id="imageUpload" 
                  type="file" 
                  accept="image/*" 
                  onChange={handleImageChange}
                  ref={fileInputRef} 
                  className="text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                />
              </FormControl>
              <FormMessage>{form.formState.errors.imageUrl?.message}</FormMessage>
            </FormItem>

            {imagePreview && (
              <div className="mt-2 relative group w-48 h-48 border rounded-md overflow-hidden">
                <Image src={imagePreview} alt="Selected image preview" layout="fill" objectFit="cover" />
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute top-1 right-1 h-6 w-6 opacity-70 group-hover:opacity-100"
                  onClick={removeImage}
                  aria-label="Remove image"
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex justify-end items-center">
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
